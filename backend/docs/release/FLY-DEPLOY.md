# Fly deploy — Phan_mem_ban_hang_online

## Phân tích lỗi dashboard

```
Could not find a Dockerfile, nor detect a runtime or framework from source code.
Error: Could not detect runtime or Dockerfile
unsuccessful command 'flyctl launch plan propose ...'
```

| | |
|---|---|
| **Giai đoạn** | *Prepare files for launch* (trước khi tạo/deploy app) |
| **Nguyên nhân** | Fly Launch quét **root monorepo**. Root không có runtime đơn (Nest nằm `backend/`, Vite nằm `frontend/`). |
| **Không phải** | API/DB/OIDC hỏng — 4 app staging đã chạy. |

## Trạng thái hiện tại (đã sửa)

Repo root đã có:

- `Dockerfile` — build API với `COPY backend/...` (đã **verify remote build** OK)
- `fly.toml` — gắn app sẵn `phan-mem-ban-hang-online-api`
- `.dockerignore` — bỏ `frontend/` khỏi context
- `scripts/deploy-staging.ps1` — deploy 4 app một lệnh

| App | URL | Health |
|---|---|---|
| `phan-mem-ban-hang-online-api` | https://phan-mem-ban-hang-online-api.fly.dev | `/health` |
| `phan-mem-ban-hang-online-web` | https://phan-mem-ban-hang-online-web.fly.dev | `/health` |
| `phan-mem-ban-hang-online-ops` | https://phan-mem-ban-hang-online-ops.fly.dev | `/` |
| `phan-mem-ban-hang-online-oidc` | https://phan-mem-ban-hang-online-oidc.fly.dev | `/health` |

## Cách deploy đúng (khuyến nghị)

```powershell
cd C:\Users\C-PC\Documents\Phan_mem_ban_hang_online
.\scripts\deploy-staging.ps1
# hoặc từng app:
.\scripts\deploy-staging.ps1 -Only api
```

Hoặc thủ công:

```powershell
cd backend
flyctl deploy --remote-only --yes
flyctl deploy -c fly.oidc.toml --remote-only --yes

cd ..\frontend
flyctl deploy -c fly.web-admin.staging.toml --remote-only --yes
flyctl deploy -c fly.ops.staging.toml --remote-only --yes
```

## Nếu vẫn dùng UI Fly

1. **Không** bấm Launch tạo app mới tên `phan-mem-ban-hang-online`.
2. Mở app **đã có** → **Deploy** (Git) với root = repo; Fly sẽ dùng `Dockerfile` + `fly.toml` ở root → chỉ deploy **API**.
3. Web / Ops / OIDC: deploy bằng script hoặc CLI ở trên (UI Launch một lần không cover đủ 4 app monorepo).

## Base directory (Git deploy riêng từng app)

| App Fly | Base directory | Dockerfile |
|---|---|---|
| `…-api` | `backend` **hoặc** repo root | `Dockerfile` |
| `…-web` | `frontend` | `apps/web-admin/Dockerfile.staging` |
| `…-ops` | `frontend` | `apps/super-admin/Dockerfile.staging` |
| `…-oidc` | `backend` | dùng `fly.oidc.toml` (CLI) |
