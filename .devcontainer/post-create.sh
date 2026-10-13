#!/usr/bin/env bash
set -e
# OpenCode inside the codespace (install as project-local tooling)
curl -fsSL https://opencode.ai/install | bash || npm i -g opencode-ai
# Start sshd (codespaces also has its own, this honors the explicit sshd request)
sudo service ssh start 2>/dev/null || true
cd backend && cargo build || true
cd ../frontend && npm install
echo "Ready. Run: opencode — then see docs/CODESPACE-PLAYBOOK.md"
