//! Turso-backed [`ProxyDatabaseTrait`] with schema-aware type mapping.
//!
//! `sea-orm-turso`'s row converter degrades every `TEXT` column to
//! `Value::String`, which SeaORM cannot materialize into `DateTime<Uuid,
//! Json, ...>` entity fields (reads fail as "Missing value for column").
//! This proxy talks to `turso::Connection` directly and rebuilds correctly
//! typed [`ProxyRow`]s using the declared column types from
//! `PRAGMA table_info`:
//!
//! * `TIMESTAMP*`/`DATETIME*` text → `Value::ChronoDateTimeWithTimeZone`
//!   (accepts RFC3339 *and* SQLite `CURRENT_TIMESTAMP` format, assumed UTC)
//! * `DATE` → `Value::ChronoDate`, `TIME` → `Value::ChronoTime`
//! * `UUID*` text → `Value::Uuid`, `JSON*` text → `Value::Json`
//! * `BOOL*` integers → `Value::Bool`, other integers → `Value::BigInt`
//! * `REAL`/`FLOAT`/`DOUBLE`/`NUMERIC` → `Value::Double`
//! * `TEXT`-family → `Value::String`, `BLOB` → `Value::Bytes`
//!
//! Known Turso ≤0.7 quirk this module relies on: none — but note migrations
//! must avoid `ADD COLUMN ... NULL` (Turso's ALTER path mis-records it as
//! `NOT NULL`); see the `add_role_to_users` migration.

use sea_orm::{DbErr, ProxyDatabaseTrait, ProxyExecResult, ProxyRow, Statement, Value as SeaValue};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::Mutex;
use turso::Value as TursoValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Affinity {
    Bool,
    Int,
    Real,
    Text,
    Blob,
    DateTimeTz,
    Date,
    Time,
    Uuid,
    Json,
    Unknown,
}

fn affinity_of(decl: &str) -> Affinity {
    let upper = decl.to_uppercase();
    if upper.contains("TIMESTAMP") || upper.contains("DATETIME") {
        Affinity::DateTimeTz
    } else if upper.contains("DATE") {
        Affinity::Date
    } else if upper.contains("TIME") {
        Affinity::Time
    } else if upper.contains("UUID") {
        Affinity::Uuid
    } else if upper.contains("JSON") {
        Affinity::Json
    } else if upper.contains("BOOL") {
        Affinity::Bool
    } else if upper.contains("INT") {
        Affinity::Int
    } else if upper.contains("REAL")
        || upper.contains("FLOAT")
        || upper.contains("DOUBLE")
        || upper.contains("NUMERIC")
        || upper.contains("DECIMAL")
    {
        Affinity::Real
    } else if upper.contains("BLOB") {
        Affinity::Blob
    } else {
        Affinity::Text
    }
}

fn parse_datetime_tz(s: &str) -> Result<chrono::DateTime<chrono::FixedOffset>, DbErr> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Ok(dt);
    }
    for fmt in &[
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%:z",
        "%Y-%m-%dT%H:%M:%S%.f%:z",
        "%Y-%m-%dT%H:%M:%S%:z",
    ] {
        if let Ok(dt) = chrono::DateTime::parse_from_str(s, fmt) {
            return Ok(dt);
        }
    }
    for fmt in &[
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
    ] {
        if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Ok(ndt.and_utc().fixed_offset());
        }
    }
    Err(DbErr::Custom(format!("unparseable timestamp: {s}")))
}

fn null_for(affinity: Affinity) -> SeaValue {
    match affinity {
        Affinity::Bool => SeaValue::Bool(None),
        Affinity::Int => SeaValue::BigInt(None),
        Affinity::Real => SeaValue::Double(None),
        Affinity::Blob => SeaValue::Bytes(None),
        Affinity::DateTimeTz => SeaValue::ChronoDateTimeWithTimeZone(None),
        Affinity::Date => SeaValue::ChronoDate(None),
        Affinity::Time => SeaValue::ChronoTime(None),
        Affinity::Uuid => SeaValue::Uuid(None),
        Affinity::Json => SeaValue::Json(None),
        Affinity::Text | Affinity::Unknown => SeaValue::String(None),
    }
}

fn map_value(val: TursoValue, affinity: Affinity, col: &str) -> Result<SeaValue, DbErr> {
    match (val, affinity) {
        (TursoValue::Null, affinity) => Ok(null_for(affinity)),
        (TursoValue::Integer(i), Affinity::Bool) => Ok(SeaValue::Bool(Some(i != 0))),
        (TursoValue::Integer(i), _) => Ok(SeaValue::BigInt(Some(i))),
        (TursoValue::Real(f), _) => Ok(SeaValue::Double(Some(f))),
        (TursoValue::Blob(b), _) => Ok(SeaValue::Bytes(Some(b))),
        (TursoValue::Text(s), Affinity::DateTimeTz) => Ok(SeaValue::ChronoDateTimeWithTimeZone(
            Some(parse_datetime_tz(&s).map_err(|e| DbErr::Custom(format!("column {col}: {e}")))?),
        )),
        (TursoValue::Text(s), Affinity::Date) => {
            let d = chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|_| DbErr::Custom(format!("column {col}: unparseable date: {s}")))?;
            Ok(SeaValue::ChronoDate(Some(d)))
        }
        (TursoValue::Text(s), Affinity::Time) => {
            let t = chrono::NaiveTime::parse_from_str(&s, "%H:%M:%S%.f")
                .or_else(|_| chrono::NaiveTime::parse_from_str(&s, "%H:%M:%S"))
                .map_err(|_| DbErr::Custom(format!("column {col}: unparseable time: {s}")))?;
            Ok(SeaValue::ChronoTime(Some(t)))
        }
        (TursoValue::Text(s), Affinity::Uuid) => {
            let u = uuid::Uuid::parse_str(&s)
                .map_err(|_| DbErr::Custom(format!("column {col}: unparseable uuid: {s}")))?;
            Ok(SeaValue::Uuid(Some(u)))
        }
        (TursoValue::Text(s), Affinity::Json) => {
            let j: serde_json::Value = serde_json::from_str(&s)
                .map_err(|_| DbErr::Custom(format!("column {col}: unparseable json")))?;
            Ok(SeaValue::Json(Some(Box::new(j))))
        }
        (TursoValue::Text(s), _) => Ok(SeaValue::String(Some(s))),
    }
}

fn sea_to_turso(val: SeaValue) -> TursoValue {
    match val {
        SeaValue::Bool(Some(b)) => TursoValue::Integer(b as i64),
        SeaValue::Bool(None) => TursoValue::Null,
        SeaValue::TinyInt(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::TinyInt(None) => TursoValue::Null,
        SeaValue::SmallInt(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::SmallInt(None) => TursoValue::Null,
        SeaValue::Int(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::Int(None) => TursoValue::Null,
        SeaValue::BigInt(Some(i)) => TursoValue::Integer(i),
        SeaValue::BigInt(None) => TursoValue::Null,
        SeaValue::TinyUnsigned(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::TinyUnsigned(None) => TursoValue::Null,
        SeaValue::SmallUnsigned(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::SmallUnsigned(None) => TursoValue::Null,
        SeaValue::Unsigned(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::Unsigned(None) => TursoValue::Null,
        SeaValue::BigUnsigned(Some(i)) => TursoValue::Integer(i as i64),
        SeaValue::BigUnsigned(None) => TursoValue::Null,
        SeaValue::Float(Some(f)) => TursoValue::Real(f as f64),
        SeaValue::Float(None) => TursoValue::Null,
        SeaValue::Double(Some(f)) => TursoValue::Real(f),
        SeaValue::Double(None) => TursoValue::Null,
        SeaValue::String(Some(s)) => TursoValue::Text(s),
        SeaValue::String(None) => TursoValue::Null,
        SeaValue::Bytes(Some(b)) => TursoValue::Blob(b),
        SeaValue::Bytes(None) => TursoValue::Null,
        SeaValue::ChronoDate(Some(d)) => TursoValue::Text(d.to_string()),
        SeaValue::ChronoDate(None) => TursoValue::Null,
        SeaValue::ChronoTime(Some(t)) => TursoValue::Text(t.to_string()),
        SeaValue::ChronoTime(None) => TursoValue::Null,
        SeaValue::ChronoDateTime(Some(dt)) => {
            TursoValue::Text(dt.format("%Y-%m-%d %H:%M:%S%.f").to_string())
        }
        SeaValue::ChronoDateTime(None) => TursoValue::Null,
        SeaValue::ChronoDateTimeUtc(Some(dt)) => TursoValue::Text(dt.to_rfc3339()),
        SeaValue::ChronoDateTimeUtc(None) => TursoValue::Null,
        SeaValue::ChronoDateTimeLocal(Some(dt)) => TursoValue::Text(dt.to_rfc3339()),
        SeaValue::ChronoDateTimeLocal(None) => TursoValue::Null,
        SeaValue::ChronoDateTimeWithTimeZone(Some(dt)) => TursoValue::Text(dt.to_rfc3339()),
        SeaValue::ChronoDateTimeWithTimeZone(None) => TursoValue::Null,
        SeaValue::TimeDate(Some(d)) => TursoValue::Text(d.to_string()),
        SeaValue::TimeDate(None) => TursoValue::Null,
        SeaValue::TimeTime(Some(t)) => TursoValue::Text(t.to_string()),
        SeaValue::TimeTime(None) => TursoValue::Null,
        SeaValue::TimeDateTime(Some(dt)) => TursoValue::Text(dt.to_string()),
        SeaValue::TimeDateTime(None) => TursoValue::Null,
        SeaValue::TimeDateTimeWithTimeZone(Some(dt)) => TursoValue::Text(dt.to_string()),
        SeaValue::TimeDateTimeWithTimeZone(None) => TursoValue::Null,
        SeaValue::Uuid(Some(u)) => TursoValue::Text(u.to_string()),
        SeaValue::Uuid(None) => TursoValue::Null,
        SeaValue::Json(Some(j)) => TursoValue::Text(j.to_string()),
        SeaValue::Json(None) => TursoValue::Null,
        SeaValue::Decimal(Some(d)) => TursoValue::Text(d.to_string()),
        SeaValue::Decimal(None) => TursoValue::Null,
        SeaValue::Char(Some(c)) => TursoValue::Text(c.to_string()),
        SeaValue::Char(None) => TursoValue::Null,
        // Enum / Array / BigDecimal / Jiff / Time-mapped leftovers and any
        // future variants: no faithful Turso scalar exists; NULL is loud
        // enough (reads surface it, writes of these types don't occur here).
        _ => TursoValue::Null,
    }
}

fn strip_quotes(name: &str) -> String {
    let b = name.as_bytes();
    if b.len() >= 2
        && ((b[0] == b'"' && b[b.len() - 1] == b'"')
            || (b[0] == b'`' && b[b.len() - 1] == b'`')
            || (b[0] == b'[' && b[b.len() - 1] == b']'))
    {
        return name[1..name.len() - 1].to_string();
    }
    // SeaORM emits `"table"."col"`; Turso may report the qualified name.
    if let Some((_, col)) = name.rsplit_once('.') {
        return strip_quotes(col.trim_matches('"'));
    }
    name.to_string()
}

fn extract_tables(sql: &str) -> Vec<String> {
    let upper = sql.to_uppercase();
    let bytes = upper.as_bytes();
    let mut tables = Vec::new();
    for keyword in &["FROM", "JOIN", "INTO", "UPDATE", "TABLE"] {
        let mut i = 0;
        while i + keyword.len() <= bytes.len() {
            if &upper[i..i + keyword.len()] == *keyword
                && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric() && bytes[i - 1] != b'_')
            {
                let mut j = i + keyword.len();
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                // take ident chars from the ORIGINAL sql at the same offsets (ASCII-safe here)
                let mut k = j;
                while k < bytes.len()
                    && (bytes[k].is_ascii_alphanumeric() || bytes[k] == b'_' || bytes[k] == b'"')
                {
                    k += 1;
                }
                let name = sql[j..k].trim_matches('"').to_string();
                if !name.is_empty()
                    && !name.eq_ignore_ascii_case("SELECT")
                    && !name.eq_ignore_ascii_case("DUAL")
                {
                    tables.push(name);
                }
                i = k.max(i + 1);
            } else {
                i += 1;
            }
        }
    }
    tables.sort();
    tables.dedup();
    tables
}

/// Single-connection Turso database behind SeaORM's proxy driver.
pub struct TursoProxy {
    conn: Arc<Mutex<turso::Connection>>,
    schema: Mutex<HashMap<String, HashMap<String, Affinity>>>,
}

impl std::fmt::Debug for TursoProxy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TursoProxy")
    }
}

impl TursoProxy {
    pub fn new(conn: turso::Connection) -> Self {
        Self {
            conn: Arc::new(Mutex::new(conn)),
            schema: Mutex::new(HashMap::new()),
        }
    }

    async fn affinity(&self, table: &str, col: &str) -> Affinity {
        {
            let cache = self.schema.lock().await;
            if let Some(aff) = cache.get(table).and_then(|cols| cols.get(col)) {
                return *aff;
            }
        }
        if let Err(e) = self.load_table_schema(table).await {
            tracing::debug!(table, error = %e, "turso proxy: PRAGMA table_info failed");
        }
        let cache = self.schema.lock().await;
        cache
            .get(table)
            .and_then(|cols| cols.get(col))
            .copied()
            .unwrap_or(Affinity::Unknown)
    }

    async fn load_table_schema(&self, table: &str) -> Result<(), DbErr> {
        {
            let cache = self.schema.lock().await;
            if cache.contains_key(table) {
                return Ok(());
            }
        }
        let safe = table.replace('"', "\"\"");
        let conn = self.conn.lock().await;
        let mut prepared = conn
            .prepare(&format!("PRAGMA table_info(\"{safe}\")"))
            .await
            .map_err(|e| DbErr::Custom(format!("PRAGMA table_info({table}): {e}")))?;
        let mut rows = prepared
            .query(())
            .await
            .map_err(|e| DbErr::Custom(format!("PRAGMA table_info({table}): {e}")))?;
        let mut cols = HashMap::new();
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| DbErr::Custom(format!("PRAGMA table_info({table}): {e}")))?
        {
            let name = row
                .get_value(1)
                .map_err(|e| DbErr::Custom(format!("PRAGMA table_info({table}): {e}")))?;
            let ty = row
                .get_value(2)
                .map_err(|e| DbErr::Custom(format!("PRAGMA table_info({table}): {e}")))?;
            if let (TursoValue::Text(name), TursoValue::Text(ty)) = (name, ty) {
                cols.insert(name, affinity_of(&ty));
            }
        }
        self.schema.lock().await.insert(table.to_string(), cols);
        Ok(())
    }

    fn params_of(stmt: &Statement) -> Vec<TursoValue> {
        stmt.values
            .as_ref()
            .map(|v| v.0.iter().map(|val| sea_to_turso(val.clone())).collect())
            .unwrap_or_default()
    }
}

#[async_trait::async_trait]
impl ProxyDatabaseTrait for TursoProxy {
    async fn query(&self, statement: Statement) -> Result<Vec<ProxyRow>, DbErr> {
        let sql = statement.sql.clone();
        let params = Self::params_of(&statement);
        let tables = extract_tables(&sql);

        // Phase 1: fetch owned column names + raw values under the lock.
        let (column_names, raw): (Vec<String>, Vec<Vec<TursoValue>>) = {
            let conn = self.conn.lock().await;
            let mut prepared = conn
                .prepare(&sql)
                .await
                .map_err(|e| DbErr::Custom(format!("prepare: {e}")))?;
            let column_names: Vec<String> = prepared
                .columns()
                .iter()
                .map(|c| strip_quotes(c.name()))
                .collect();
            let mut rows = if params.is_empty() {
                prepared
                    .query(())
                    .await
                    .map_err(|e| DbErr::Custom(format!("query: {e}")))?
            } else {
                prepared
                    .query(params)
                    .await
                    .map_err(|e| DbErr::Custom(format!("query: {e}")))?
            };
            let mut raw = Vec::new();
            while let Some(row) = rows
                .next()
                .await
                .map_err(|e| DbErr::Custom(format!("row: {e}")))?
            {
                let mut vals = Vec::with_capacity(column_names.len());
                for i in 0..column_names.len() {
                    vals.push(
                        row.get_value(i)
                            .map_err(|e| DbErr::Custom(format!("column {i}: {e}")))?,
                    );
                }
                raw.push(vals);
            }
            (column_names, raw)
        };

        // Phase 2 (lock released): resolve affinities (may PRAGMA on a miss)
        // and map to typed SeaORM values.
        let mut affs = Vec::with_capacity(column_names.len());
        for col in &column_names {
            let mut affinity = Affinity::Unknown;
            for t in &tables {
                let a = self.affinity(t, col).await;
                if a != Affinity::Unknown {
                    affinity = a;
                    break;
                }
            }
            affs.push(affinity);
        }

        let mut out = Vec::with_capacity(raw.len());
        for row_vals in raw {
            let mut values = std::collections::BTreeMap::new();
            for ((col, aff), val) in column_names.iter().zip(affs.iter()).zip(row_vals) {
                values.insert(col.clone(), map_value(val, *aff, col)?);
            }
            out.push(ProxyRow::new(values));
        }
        Ok(out)
    }

    async fn execute(&self, statement: Statement) -> Result<ProxyExecResult, DbErr> {
        let sql = statement.sql.clone();
        let params = Self::params_of(&statement);
        let conn = self.conn.lock().await;
        let rows_affected = if params.is_empty() {
            conn.execute(&sql, ())
                .await
                .map_err(|e| DbErr::Custom(format!("execute: {e}")))?
        } else {
            conn.execute(&sql, params)
                .await
                .map_err(|e| DbErr::Custom(format!("execute: {e}")))?
        };
        let last_insert_id = conn.last_insert_rowid() as u64;
        drop(conn);
        let _ = self.conn.lock().await.cacheflush();
        Ok(ProxyExecResult::new(last_insert_id, rows_affected))
    }

    async fn begin(&self) {
        if let Err(e) = self.conn.lock().await.execute("BEGIN", ()).await {
            tracing::warn!(error = %e, "turso proxy: BEGIN failed");
        }
    }

    async fn commit(&self) {
        if let Err(e) = self.conn.lock().await.execute("COMMIT", ()).await {
            tracing::warn!(error = %e, "turso proxy: COMMIT failed");
        }
    }

    async fn rollback(&self) {
        if let Err(e) = self.conn.lock().await.execute("ROLLBACK", ()).await {
            tracing::warn!(error = %e, "turso proxy: ROLLBACK failed");
        }
    }

    async fn ping(&self) -> Result<(), DbErr> {
        let conn = self.conn.lock().await;
        let mut stmt = conn
            .prepare("SELECT 1")
            .await
            .map_err(|e| DbErr::Custom(e.to_string()))?;
        let mut rows = stmt
            .query(())
            .await
            .map_err(|e| DbErr::Custom(e.to_string()))?;
        rows.next()
            .await
            .map_err(|e| DbErr::Custom(e.to_string()))?;
        Ok(())
    }
}
