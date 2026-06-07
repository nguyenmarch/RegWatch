# RegWatch — Kiến trúc & Luồng hoạt động trên AWS EKS

## Sơ đồ tổng thể

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║                                     INTERNET                                             ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
                                          │
                                   HTTP :80
                                          │
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  AWS REGION: us-east-1                                                                   ║
║                                                                                          ║
║  ┌─────────────────────────────────────────────────────────────────────────────────┐    ║
║  │  VPC  (10.0.0.0/16)                                                             │    ║
║  │                                                                                  │    ║
║  │  ┌──────────────────────────────────────────────────────────────────────────┐   │    ║
║  │  │  PUBLIC SUBNETS  (AZ-a: 10.0.1.0/24 │ AZ-b: 10.0.2.0/24)               │   │    ║
║  │  │                                                                           │   │    ║
║  │  │   ┌─────────────────────────────────────────────────────────────────┐    │   │    ║
║  │  │   │  AWS Application Load Balancer  (Internet-facing)               │    │   │    ║
║  │  │   │  Provisioned by: AWS Load Balancer Controller (in kube-system)  │    │   │    ║
║  │  │   │  K8s resource  : Ingress/regwatch-ingress  (namespace: regwatch)│    │   │    ║
║  │  │   │                                                                  │    │   │    ║
║  │  │   │  Listener: HTTP :80                                              │    │   │    ║
║  │  │   │  Rule:  path /*  →  Target Group → frontend pods :80            │    │   │    ║
║  │  │   └─────────────────────────────────────────────────────────────────┘    │   │    ║
║  │  │                              │ target-type: ip                            │   │    ║
║  │  └──────────────────────────────│────────────────────────────────────────────┘   │    ║
║  │                                 │                                                │    ║
║  │  ┌──────────────────────────────│────────────────────────────────────────────┐   │    ║
║  │  │  PRIVATE SUBNETS  (AZ-a: 10.0.3.0/24 │ AZ-b: 10.0.4.0/24)              │   │    ║
║  │  │                              │                                             │   │    ║
║  │  │  ┌───────────────────────────┼─────────────────────────────────────────┐  │   │    ║
║  │  │  │  EKS CLUSTER: regwatch-cluster   Nodes: 2x t3.large                │  │   │    ║
║  │  │  │  K8s v1.31    Pod CIDR: 192.168.0.0/16                             │  │   │    ║
║  │  │  │                           │                                          │  │   │    ║
║  │  │  │  ╔════════════════════════╪══════════════════════════════════════╗   │  │   │    ║
║  │  │  │  ║  Namespace: regwatch  │                                      ║   │  │   │    ║
║  │  │  │  ║                       ▼                                      ║   │  │   │    ║
║  │  │  │  ║  ┌─────────────────────────────────────────┐                ║   │  │   │    ║
║  │  │  │  ║  │  Service/frontend  (ClusterIP)           │                ║   │  │   │    ║
║  │  │  │  ║  │  port: 80 → targetPort: 80               │                ║   │  │   │    ║
║  │  │  │  ║  └──────────────────┬──────────────────────┘                ║   │  │   │    ║
║  │  │  │  ║                     │ selector: app=frontend                 ║   │  │   │    ║
║  │  │  │  ║          ┌──────────┴──────────┐                            ║   │  │   │    ║
║  │  │  │  ║          │                     │                            ║   │  │   │    ║
║  │  │  │  ║   ┌──────▼──────┐   ┌──────────▼──────┐                   ║   │  │   │    ║
║  │  │  │  ║   │  Pod:       │   │  Pod:            │  replicas: 2      ║   │  │   │    ║
║  │  │  │  ║   │  frontend-0 │   │  frontend-1      │                   ║   │  │   │    ║
║  │  │  │  ║   │  nginx:1.27 │   │  nginx:1.27      │                   ║   │  │   │    ║
║  │  │  │  ║   │  :80        │   │  :80             │                   ║   │  │   │    ║
║  │  │  │  ║   │             │   │                  │                   ║   │  │   │    ║
║  │  │  │  ║   │  nginx.conf │   │  nginx.conf      │  <- ConfigMap     ║   │  │   │    ║
║  │  │  │  ║   │  (ConfigMap)│   │  (ConfigMap)     │    frontend-nginx  ║   │  │   │    ║
║  │  │  │  ║   └──────┬──────┘   └──────────┬───────┘                   ║   │  │   │    ║
║  │  │  │  ║          │                     │                            ║   │  │   │    ║
║  │  │  │  ║          └─────────┬───────────┘                            ║   │  │   │    ║
║  │  │  │  ║                    │                                         ║   │  │   │    ║
║  │  │  │  ║     location /api/ { proxy_pass http://backend:8000/ }       ║   │  │   │    ║
║  │  │  │  ║     strips /api prefix before forwarding                     ║   │  │   │    ║
║  │  │  │  ║                    │                                         ║   │  │   │    ║
║  │  │  │  ║                    ▼ HTTP :8000                              ║   │  │   │    ║
║  │  │  │  ║  ┌─────────────────────────────────────────┐                ║   │  │   │    ║
║  │  │  │  ║  │  Service/backend  (ClusterIP)            │                ║   │  │   │    ║
║  │  │  │  ║  │  port: 8000 → targetPort: 8000           │                ║   │  │   │    ║
║  │  │  │  ║  └──────────────────┬──────────────────────┘                ║   │  │   │    ║
║  │  │  │  ║                     │ selector: app=backend                  ║   │  │   │    ║
║  │  │  │  ║                     ▼                                        ║   │  │   │    ║
║  │  │  │  ║   ┌──────────────────────────────────────────────────────┐   ║   │  │   │    ║
║  │  │  │  ║   │  Pod: backend   (Deployment, replicas: 1)            │   ║   │  │   │    ║
║  │  │  │  ║   │  FastAPI / Uvicorn  python:3.12  :8000               │   ║   │  │   │    ║
║  │  │  │  ║   │                                                       │   ║   │  │   │    ║
║  │  │  │  ║   │  env <- ConfigMap/regwatch-config                     │   ║   │  │   │    ║
║  │  │  │  ║   │  env <- Secret/regwatch-secrets                       │   ║   │  │   │    ║
║  │  │  │  ║   │  vol <- emptyDir /root/.cache/huggingface (HF model)  │   ║   │  │   │    ║
║  │  │  │  ║   └───┬──────────┬────────────┬──────────────────────┬───┘   ║   │  │   │    ║
║  │  │  │  ║       │          │            │                      │        ║   │  │   │    ║
║  │  │  │  ║  :3306│     :6333│       :7687│               HTTPS  │        ║   │  │   │    ║
║  │  │  │  ║       ▼          ▼            ▼               :443   │        ║   │  │   │    ║
║  │  │  │  ║  ┌─────────┐ ┌────────┐ ┌─────────┐                 │        ║   │  │   │    ║
║  │  │  │  ║  │ Svc     │ │ Svc    │ │ Svc     │                 │        ║   │  │   │    ║
║  │  │  │  ║  │ mysql   │ │ qdrant │ │ neo4j   │                 │        ║   │  │   │    ║
║  │  │  │  ║  │Headless │ │Headless│ │Headless │                 │        ║   │  │   │    ║
║  │  │  │  ║  └────┬────┘ └───┬────┘ └────┬────┘                 │        ║   │  │   │    ║
║  │  │  │  ║       │          │            │                      │        ║   │  │   │    ║
║  │  │  │  ║       ▼          ▼            ▼                      │        ║   │  │   │    ║
║  │  │  │  ║  ┌─────────┐ ┌────────┐ ┌─────────┐                 │        ║   │  │   │    ║
║  │  │  │  ║  │StatefulS│ │StatefulS│ │StatefulS│                 │        ║   │  │   │    ║
║  │  │  │  ║  │ mysql-0 │ │qdrant-0│ │ neo4j-0 │                 │        ║   │  │   │    ║
║  │  │  │  ║  │MySQL 8.4│ │v1.12.1 │ │  Neo4j5 │                 │        ║   │  │   │    ║
║  │  │  │  ║  │  :3306  │ │:6333   │ │:7687bolt│                 │        ║   │  │   │    ║
║  │  │  │  ║  │         │ │:6334   │ │:7474http│                 │        ║   │  │   │    ║
║  │  │  │  ║  └────┬────┘ └───┬────┘ └────┬────┘                 │        ║   │  │   │    ║
║  │  │  │  ║       │  PVC     │  PVC       │  PVC                 │        ║   │  │   │    ║
║  │  │  │  ╚═══════╪══════════╪════════════╪══════════════════════╪════════╝   │  │   │    ║
║  │  │  │          │          │            │                      │            │  │   │    ║
║  │  │  └──────────│──────────│────────────│──────────────────────│────────────┘  │   │    ║
║  │  │             │          │            │                      │               │   │    ║
║  │  │   ┌─────────▼──┐  ┌───▼─────┐  ┌──▼──────────┐           │               │   │    ║
║  │  │   │ EBS gp2    │  │EBS gp2  │  │ EBS gp2     │           │               │   │    ║
║  │  │   │ mysql-pvc  │  │qdrant   │  │ neo4j-pvc   │           │               │   │    ║
║  │  │   │ 20Gi       │  │-pvc 20Gi│  │ 20Gi        │           │               │   │    ║
║  │  │   └────────────┘  └─────────┘  └─────────────┘           │               │   │    ║
║  │  │                                                            │               │   │    ║
║  │  └────────────────────────────────────────────────────────────│───────────────┘   │    ║
║  │                                                               │                   │    ║
║  └───────────────────────────────────────────────────────────────│───────────────────┘    ║
║                                                                   │                        ║
║   ┌─────────────────────────────────────┐                         │                        ║
║   │  AWS S3                             │ <───────────────────────┘                        ║
║   │  regwatch-documents-339388639465    │   HTTPS :443                                     ║
║   │  endpoint: s3.amazonaws.com         │   MinIO SDK -> S3 API                            ║
║   │  auth: IAM Access Key (Secret)      │                                                  ║
║   └─────────────────────────────────────┘                                                  ║
║                                                                                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
                          │
                          │ HTTPS (external API calls tu backend pod)
                          ▼
         ┌────────────────────────────────┐
         │  Google Gemini API             │
         │  gemini-2.5-flash              │
         │  text-embedding-004            │
         │  api.generativeai.google.com   │
         └────────────────────────────────┘
```

---

## Luồng request theo từng tính năng

### 1. Truy cập trang web

```
Browser
  │  GET http://<alb>.elb.amazonaws.com/
  ▼
AWS ALB :80
  │  Listener rule: /* → Target Group (frontend pods)
  ▼
Service/frontend (ClusterIP :80)
  │  Round-robin giữa 2 frontend pods
  ▼
nginx Pod :80
  │  location /  →  try_files $uri /index.html
  ▼
Trả về React SPA (index.html + JS bundle)
```

---

### 2. Gọi API từ frontend (ví dụ: đăng nhập)

```
Browser
  │  POST http://<alb>/api/auth/login
  ▼
AWS ALB :80
  ▼
nginx Pod :80
  │  location /api/  →  proxy_pass http://backend:8000/
  │  URL rewrite: /api/auth/login  →  /auth/login
  ▼
Service/backend (ClusterIP :8000)
  ▼
FastAPI Pod :8000
  │  router: /auth/login
  │  BCrypt verify password
  ▼
Service/mysql (Headless :3306)
  ▼
StatefulSet mysql-0
  │  SELECT user WHERE email = ?
  ▼
FastAPI Pod
  │  Tạo JWT token (SECRET_KEY từ Secret)
  ▼
Response 200 + token → nginx → ALB → Browser
```

---

### 3. Upload & xử lý tài liệu pháp luật

```
Browser
  │  POST /api/documents/upload  (multipart PDF/DOCX)
  ▼
FastAPI Pod
  │
  ├─[1] Parse file (PyMuPDF / python-docx)
  │
  ├─[2] Lưu file gốc
  │       │  PUT object
  │       ▼
  │      AWS S3  (regwatch-documents-339388639465)
  │       HTTPS :443  /  MinIO SDK → S3 API
  │
  ├─[3] Lưu metadata
  │       │  INSERT document
  │       ▼
  │      MySQL StatefulSet :3306  (EBS 20Gi)
  │
  ├─[4] Chunking  (chunk_size=1000, overlap=100)
  │
  ├─[5] Embedding từng chunk
  │       │  model: keepitreal/vietnamese-sbert
  │       │  dimension: 768
  │       │  (model cache: emptyDir /root/.cache/huggingface)
  │       ▼
  │      Sentence-Transformers (in-process)
  │
  ├─[6] Lưu vectors
  │       │  upsert points
  │       ▼
  │      Qdrant StatefulSet :6333  (EBS 20Gi)
  │      Collection: law_collection
  │
  └─[7] Xây graph quan hệ
          │  CREATE nodes/relationships
          ▼
         Neo4j StatefulSet :7687  (EBS 20Gi)
```

---

### 4. Chat / hỏi đáp tài liệu (RAG Pipeline)

```
Browser
  │  POST /api/chat/message  { "question": "..." }
  ▼
FastAPI Pod  (LangGraph workflow)
  │
  ├─[1] Embed câu hỏi
  │       │  vietnamese-sbert  →  vector 768-dim
  │       ▼
  │      Sentence-Transformers (in-process)
  │
  ├─[2] Vector search (semantic)
  │       │  search top-k chunks
  │       ▼
  │      Qdrant :6333
  │
  ├─[3] Graph query (structural)
  │       │  MATCH (n)-[r]->()  WHERE n.id IN [...]
  │       ▼
  │      Neo4j :7687 (Bolt)
  │
  ├─[4] Tổng hợp context  (chunks + graph relationships)
  │
  └─[5] Sinh câu trả lời
          │  prompt + context  →  LLM
          ▼
         Google Gemini API  (gemini-2.5-flash)
         HTTPS :443  /  api.generativeai.google.com

  Response → nginx → ALB → Browser (streaming)
```

---

## Kubernetes resources chi tiết

### Namespace: `regwatch`

| Kind | Name | Image | Replicas | Port |
|------|------|-------|----------|------|
| Deployment | frontend | ECR/regwatch/frontend | 2 | 80 |
| Deployment | backend | ECR/regwatch/backend | 1 | 8000 |
| StatefulSet | mysql | mysql:8.4 | 1 | 3306 |
| StatefulSet | qdrant | qdrant/qdrant:v1.12.1 | 1 | 6333, 6334 |
| StatefulSet | neo4j | neo4j:5 | 1 | 7474, 7687 |

### Services

| Service | Type | Port | Selector |
|---------|------|------|----------|
| frontend | ClusterIP | 80 | app=frontend |
| backend | ClusterIP | 8000 | app=backend |
| mysql | Headless (ClusterIP: None) | 3306 | app=mysql |
| qdrant | Headless (ClusterIP: None) | 6333, 6334 | app=qdrant |
| neo4j | Headless (ClusterIP: None) | 7474, 7687 | app=neo4j |

### Ingress

| Resource | Class | Scheme | Rule |
|----------|-------|--------|------|
| regwatch-ingress | alb | internet-facing | `/*` → frontend:80 |

### Storage (EBS gp2)

| PVC | Size | Mount | Pod |
|-----|------|-------|-----|
| mysql-storage-mysql-0 | 20Gi | /var/lib/mysql | mysql-0 |
| qdrant-storage-qdrant-0 | 20Gi | /qdrant/storage | qdrant-0 |
| neo4j-storage-neo4j-0 | 20Gi | /data | neo4j-0 |

### ConfigMaps & Secrets

| Resource | Kind | Dùng bởi |
|----------|------|----------|
| regwatch-config | ConfigMap | backend (envFrom) |
| frontend-nginx-config | ConfigMap | frontend (volume mount /etc/nginx/conf.d) |
| regwatch-secrets | Secret | backend (env), mysql, neo4j |

---

## Security Groups

| Layer | Inbound | Outbound |
|-------|---------|----------|
| ALB | 0.0.0.0/0 :80 | Node SG :80 |
| EC2 Nodes | ALB SG :80, Node SG (all internal) | 0.0.0.0/0 |
| Pods | Node SG (in-cluster) | 0.0.0.0/0 (S3, Gemini API) |

---

## DNS resolution trong cluster

Kubernetes CoreDNS tự động resolve service names:

```
mysql        →  mysql.regwatch.svc.cluster.local        :3306
qdrant       →  qdrant.regwatch.svc.cluster.local       :6333
neo4j        →  neo4j.regwatch.svc.cluster.local        :7687
backend      →  backend.regwatch.svc.cluster.local      :8000
frontend     →  frontend.regwatch.svc.cluster.local     :80
```

Backend pod dùng tên ngắn (`mysql`, `qdrant`, `neo4j`) vì cùng namespace `regwatch`.
Frontend nginx dùng `http://backend:8000/` để proxy API.

---

## Luồng khởi động (startup order)

```
1. mysql-0     khởi động → healthy (mysqladmin ping)          ~30s
2. qdrant-0    khởi động → healthy (GET /readyz)              ~15s
3. neo4j-0     khởi động → healthy (TCP :7687)                ~60s
4. backend     khởi động → tải HuggingFace model              ~5-10 phút (lần đầu)
               → kết nối MySQL, Qdrant, Neo4j
               → ensure S3 bucket exists
               → healthy (TCP :8000)
5. frontend    khởi động → serve static files                  ~5s
6. ALB         provisioned → DNS ready                         ~2-3 phút
```
