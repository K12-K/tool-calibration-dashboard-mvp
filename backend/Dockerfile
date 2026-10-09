FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# tzdata so the TZ environment variable works (due dates / "days left" use the server's local date)
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data/uploads \
    && chown -R appuser:appuser /data /srv
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "::", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
