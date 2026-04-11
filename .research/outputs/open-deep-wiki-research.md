# Open Deep Wiki — Research Report

## Summary

There are **two** open-source DeepWiki alternatives, both actively maintained. The more popular one (and likely what was asked about) is **deepwiki-open** by AsyncFuncAI. There's also **OpenDeepWiki** by AIDotNet, a separate project with a different tech stack.

## Candidate 1: deepwiki-open (AsyncFuncAI)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/AsyncFuncAI/deepwiki-open |
| **Stars** | ~15k |
| **Forks** | ~1.7k |
| **License** | MIT |
| **Created** | April 30, 2025 |
| **Last commit** | March 5, 2026 |
| **Contributors** | 70 |
| **Languages** | Python (52%), TypeScript (46.6%), CSS, Dockerfile |

### Tech Stack
- **Backend**: Python (FastAPI), Poetry for dependency management
- **Frontend**: TypeScript (Next.js)
- **AI Providers**: Google Gemini, OpenAI, OpenRouter, Azure OpenAI, local Ollama
- **Embeddings**: OpenAI or Google AI embeddings
- **Diagrams**: Mermaid
- **Deployment**: Docker Compose, or manual (Python + npm)

### Setup Requirements
1. Clone repo
2. Set API keys in `.env` (Google API key and/or OpenAI key required)
3. Either:
   - **Docker**: `docker-compose up`
   - **Manual**: `poetry install -C api` for backend, `npm install` for frontend

### Key Features
- Instant wiki generation from GitHub/GitLab/Bitbucket repos
- Private repo support (via access tokens)
- AI-powered code analysis and documentation
- Mermaid diagrams auto-generated
- RAG-powered "Ask" feature (chat with repo)
- Deep Research mode
- Multi-model support (Gemini, OpenAI, OpenRouter, Azure, Ollama)

### Maintenance Status
- **Warning**: Primary active development is shifting to **AsyncReview** (new project by same author). DeepWiki-Open is in "maintenance mode" — still receiving updates but not the author's primary focus going forward.

---

## Candidate 2: OpenDeepWiki (AIDotNet)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://github.com/AIDotNet/OpenDeepWiki |
| **Stars** | ~3k |
| **Forks** | ~389 |
| **License** | (check repo) |
| **Last commit** | March 16, 2026 |
| **Commits** | 915 |
| **Tags/Releases** | 35 |

### Tech Stack
- **Backend**: C# / .NET 9, Semantic Kernel
- **Frontend**: TypeScript (Next.js)
- **AI Providers**: OpenAI, AzureOpenAI, Anthropic (models must support function calling)
- **Database**: SQLite (default), PostgreSQL, SQL Server, MySQL
- **Deployment**: Docker Compose, Makefile, one-click Sealos deploy

### Setup Requirements
1. Clone repo
2. Configure environment variables in `docker-compose.yml` (model, API key, endpoint)
3. `docker-compose build && docker-compose up -d`
4. Access at http://localhost:8090

### Key Features
- Code analysis, documentation generation, knowledge graph construction
- Multi-platform repo support (GitHub, GitLab, Gitee, Gitea, AtomGit)
- Multi-language translation
- MCP (Model Context Protocol) server support
- Feishu Bot integration
- Incremental updates / smart filtering
- Context compression system
- More enterprise-oriented (multiple DB backends, Sealos deployment)

### Maintenance Status
- **Actively maintained** — last commit March 16, 2026, 915 commits, 35 releases. No indication of slowing down.

---

## Comparison

| Factor | deepwiki-open | OpenDeepWiki |
|--------|--------------|--------------|
| Popularity | 15k stars | 3k stars |
| Stack | Python + TypeScript | C# (.NET 9) + TypeScript |
| AI Models | Gemini, OpenAI, OpenRouter, Ollama, Azure | OpenAI, Azure, Anthropic |
| Database | None (file-based) | SQLite, Postgres, MySQL, SQL Server |
| Active dev | Maintenance mode (shifting to AsyncReview) | Actively developed |
| Setup ease | Very simple (env + docker-compose) | Slightly more config (DB, more env vars) |
| Enterprise features | Lighter | More (DB options, MCP, Feishu, incremental updates) |

## Sources
- [AsyncFuncAI/deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open)
- [AIDotNet/OpenDeepWiki](https://github.com/AIDotNet/OpenDeepWiki)
- [Exa search results for deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open)
- [AsyncFunc official docs](https://asyncfunc.mintlify.app/getting-started/introduction)
