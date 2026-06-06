from functools import lru_cache
from datetime import datetime, timezone
import json
import logging
import os
from urllib.parse import quote

from minio import Minio
from minio.credentials import Credentials
from minio.credentials.providers import Provider
from urllib3 import PoolManager, Timeout

from app.core.config import settings

logger = logging.getLogger(__name__)


class Ec2IamRoleProvider(Provider):
    def __init__(self, endpoint: str = "http://169.254.169.254"):
        self._endpoint = endpoint.rstrip("/")
        self._http = PoolManager(timeout=Timeout(connect=2.0, read=5.0))
        self._credentials: Credentials | None = None

    def retrieve(self) -> Credentials:
        if self._credentials and not self._credentials.is_expired():
            return self._credentials

        headers = self._metadata_headers()
        role_name = self._get(
            f"{self._endpoint}/latest/meta-data/iam/security-credentials/",
            headers=headers,
        ).splitlines()[0].strip()
        data = json.loads(self._get(
            f"{self._endpoint}/latest/meta-data/iam/security-credentials/{quote(role_name)}",
            headers=headers,
        ))

        if data.get("Code", "Success") != "Success":
            raise ValueError(f"IMDS credential fetch failed: {data}")

        expiration = datetime.fromisoformat(
            data["Expiration"].replace("Z", "+00:00")
        ).astimezone(timezone.utc)
        self._credentials = Credentials(
            data["AccessKeyId"],
            data["SecretAccessKey"],
            data.get("Token"),
            expiration,
        )
        return self._credentials

    def _metadata_headers(self) -> dict[str, str] | None:
        try:
            token = self._request(
                "PUT",
                f"{self._endpoint}/latest/api/token",
                headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
            )
            return {"X-aws-ec2-metadata-token": token} if token else None
        except Exception:
            return None

    def _get(self, url: str, headers: dict[str, str] | None = None) -> str:
        return self._request("GET", url, headers=headers)

    def _request(
        self,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
    ) -> str:
        response = self._http.request(method, url, headers=headers)
        if response.status >= 300:
            raise ValueError(f"{url} failed with HTTP status code {response.status}")
        return response.data.decode("utf-8")


@lru_cache
def get_minio_client() -> Minio:
    client_kwargs = {
        "endpoint": settings.MINIO_ENDPOINT,
        "secure": settings.MINIO_SECURE,
        "region": settings.MINIO_REGION,
    }

    if settings.MINIO_USE_IAM_ROLE:
        # EKS may expose container credential env vars that are not valid for
        # node-role IMDS. Force MinIO's provider down the EC2 metadata path.
        os.environ.pop("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", None)
        os.environ.pop("AWS_CONTAINER_CREDENTIALS_FULL_URI", None)
        client_kwargs["credentials"] = Ec2IamRoleProvider()
    else:
        client_kwargs["access_key"] = settings.MINIO_ACCESS_KEY
        client_kwargs["secret_key"] = settings.MINIO_SECRET_KEY

    return Minio(
        **client_kwargs,
    )


def ensure_minio_bucket() -> None:
    if not settings.MINIO_AUTO_CREATE_BUCKET:
        logger.info(
            "[MinIO] Bucket auto-create disabled; using existing bucket: %s",
            settings.MINIO_BUCKET,
        )
        return

    client = get_minio_client()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET)
        logger.info("[MinIO] Bucket created: %s", settings.MINIO_BUCKET)
    else:
        logger.info("[MinIO] Bucket exists: %s", settings.MINIO_BUCKET)
