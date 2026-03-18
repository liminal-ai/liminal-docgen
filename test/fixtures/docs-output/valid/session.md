# Session

Session lifecycle documentation.

```mermaid
sequenceDiagram
  participant User
  participant Auth
  User->>Auth: login
  Auth-->>User: session token
```
