# RegWatch — EKS Deployment Guide

## Architecture Overview

```
Internet
   │
   ▼
AWS ALB (Ingress)
   │  /* (all traffic)
   ▼
Frontend Service (ClusterIP :80)
   │  nginx proxies /api/* → http://backend:8000/
   ▼
Backend Service (ClusterIP :8000)
   │
   ├── MySQL StatefulSet    (gp2 EBS, 20Gi)
   ├── Qdrant StatefulSet   (gp2 EBS, 20Gi)
   └── Neo4j StatefulSet    (gp2 EBS, 20Gi)

Object Storage: AWS S3 (replaces MinIO)
```

## Prerequisites

Install these tools before starting:

| Tool | Install |
|------|---------|
| [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) | `aws --version` |
| [eksctl](https://eksctl.io/installation/) | `eksctl version` |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | `kubectl version --client` |
| [Helm 3](https://helm.sh/docs/intro/install/) | `helm version` |
| [Docker](https://docs.docker.com/get-docker/) | `docker --version` |

Configure AWS CLI:
```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region:        us-east-1
# Default output format: json
```

---

## Step 1 — Setup AWS Resources

Linux/macOS:
```bash
cd deploy/scripts/linux
chmod +x *.sh
./1-setup-aws.sh
```

Windows PowerShell:
```powershell
cd deploy\scripts\windows
.\1-setup-aws.ps1
```

This creates:
- ECR repositories: `regwatch/backend`, `regwatch/frontend`
- S3 bucket: `regwatch-documents-<account-id>`
- S3 permissions are attached to the EKS node IAM role in Step 4

Do not create or store IAM access keys for the backend pod.

---

## Step 2 — Fill in Secrets

Copy the example file, then edit the local secret file:

Linux/macOS:
```bash
cp deploy/k8s/02-secrets.example.yaml deploy/k8s/02-secrets.yaml
```

Windows PowerShell:
```powershell
Copy-Item deploy\k8s\02-secrets.example.yaml deploy\k8s\02-secrets.yaml
```

Edit `deploy/k8s/02-secrets.yaml` and replace ALL `CHANGE_ME` values:

```yaml
stringData:
  SECRET_KEY: "<random 32+ char string>"         # python3 -c "import secrets; print(secrets.token_hex(32))"
  MYSQL_PASSWORD: "<strong password>"
  NEO4J_PASSWORD: "<strong password>"
  NEO4J_AUTH: "neo4j/<same as NEO4J_PASSWORD>"   # format: "neo4j/<password>"
  MINIO_ACCESS_KEY: ""                            # unused when MINIO_USE_IAM_ROLE=true
  MINIO_SECRET_KEY: ""                            # unused when MINIO_USE_IAM_ROLE=true
  GEMINI_API_KEY: "<your Gemini API key>"
```

Also update the S3 bucket name in [deploy/k8s/01-configmap.yaml](deploy/k8s/01-configmap.yaml):
```yaml
MINIO_BUCKET: "regwatch-documents-<your-account-id>"
```

> **Never commit `02-secrets.yaml` to git**. This repo ignores it via `.gitignore`; commit only `02-secrets.example.yaml`.

---

## Step 3 — Build & Push Docker Images

```bash
./2-build-push.sh
```

On Windows, run `.\2-build-push.ps1` from `deploy\scripts\windows`.

This builds `linux/amd64` images and pushes them to ECR.
It also patches `PLACEHOLDER_ECR_REGISTRY` in the k8s manifests automatically.

> If building on Apple Silicon (M1/M2), Docker will cross-compile for linux/amd64.

---

## Step 4 — Create EKS Cluster

```bash
./3-create-cluster.sh
```

On Windows, run `.\3-create-cluster.ps1` from `deploy\scripts\windows`.

- Creates `regwatch-cluster` in `us-east-1`
- Grants the EKS node role read/write/delete access to the S3 bucket
- 2x `t3.large` nodes (auto-scales to 4)
- Installs AWS EBS CSI driver (for PersistentVolumes)
- Installs AWS Load Balancer Controller (for ALB Ingress)

**Duration: ~15–20 minutes**

---

## Step 5 — Deploy to Kubernetes

```bash
./4-deploy.sh
```

On Windows, run `.\4-deploy.ps1` from `deploy\scripts\windows`.

Applies all manifests in order and waits for databases to be healthy before
deploying the app. At the end, prints the ALB URL.

```
Application URL: http://<alb-hostname>.us-east-1.elb.amazonaws.com
```

> **First backend startup** is slow (~5–10 min) because the
> `keepitreal/vietnamese-sbert` sentence-transformers model is downloaded
> from HuggingFace. The `startupProbe` allows up to 10 minutes.

---

## One-command Flows

After changing application code on Windows:
```powershell
cd deploy\scripts\windows
.\5-redeploy-code.ps1
```

After changing application code on Linux/macOS:
```bash
cd deploy/scripts/linux
./5-redeploy-code.sh
```

From-scratch deployment on Windows:
```powershell
cd deploy\scripts\windows
.\0-deploy-from-scratch.ps1
```

From-scratch deployment on Linux/macOS:
```bash
cd deploy/scripts/linux
./0-deploy-from-scratch.sh
```

Before running a from-scratch deploy, copy `deploy/k8s/02-secrets.example.yaml` to `deploy/k8s/02-secrets.yaml`, then fill real values.

---

## Verify Deployment

```bash
# All pods should be Running
kubectl get pods -n regwatch

# Expected:
# backend-xxx        1/1  Running
# frontend-xxx       1/1  Running
# frontend-xxx       1/1  Running
# mysql-0            1/1  Running
# neo4j-0            1/1  Running
# qdrant-0           1/1  Running

# Get ALB URL
kubectl get ingress -n regwatch

# Tail backend logs
kubectl logs -f deployment/backend -n regwatch
```

---

## Update / Redeploy

After code changes:

```bash
# Build and push new images
IMAGE_TAG=v1.1 ./2-build-push.sh

# Update image tag in deployments
kubectl set image deployment/backend \
  backend=<ECR_REGISTRY>/regwatch/backend:v1.1 -n regwatch

kubectl set image deployment/frontend \
  frontend=<ECR_REGISTRY>/regwatch/frontend:v1.1 -n regwatch

# Watch rollout
kubectl rollout status deployment/backend -n regwatch
```

---

## Troubleshooting

### Backend pod stuck in Init/Pending
```bash
kubectl describe pod -l app=backend -n regwatch
kubectl logs -l app=backend -n regwatch --previous
```
Common cause: database not ready yet or secrets misconfigured.

### ALB not getting an address
```bash
kubectl describe ingress regwatch-ingress -n regwatch
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```
Ensure the ALB controller is running and the node subnets have the tag
`kubernetes.io/role/elb: 1` (eksctl adds this automatically).

### S3 / MinIO connection errors
The backend uses MinIO SDK pointed to AWS S3 endpoint
`s3.us-east-1.amazonaws.com`. Verify:
- `MINIO_USE_IAM_ROLE: "true"` in configmap
- `MINIO_AUTO_CREATE_BUCKET: "false"` in configmap
- The EKS node role has inline policy `RegWatchS3Access`
- `MINIO_BUCKET` = exact bucket name (check S3 console)
- `MINIO_SECURE: "true"` in configmap

---

## Cost Estimate (us-east-1)

| Resource | Spec | ~USD/month |
|----------|------|-----------|
| EKS Control Plane | — | $73 |
| EC2 Nodes | 2× t3.large | $120 |
| EBS Volumes | 3× 20Gi gp2 | $6 |
| ALB | — | $22 |
| S3 | minimal | <$1 |
| ECR | ~2 images | <$1 |
| **Total** | | **~$222/month** |

To reduce costs, use `t3.medium` nodes and reduce replicas to minimum.

---

## Clean Up

```bash
# Delete K8s resources
kubectl delete namespace regwatch

# Delete EKS cluster (deletes nodes + volumes)
eksctl delete cluster -f deploy/eks/cluster.yaml

# Delete ECR images (optional)
aws ecr delete-repository --repository-name regwatch/backend --force --region us-east-1
aws ecr delete-repository --repository-name regwatch/frontend --force --region us-east-1

# Delete S3 bucket (optional — careful, deletes all data)
aws s3 rb s3://regwatch-documents-<account-id> --force
```
