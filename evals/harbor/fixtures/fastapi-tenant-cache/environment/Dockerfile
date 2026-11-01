FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /workspace
COPY workspace/requirements.lock /workspace/requirements.lock
RUN python -m pip install --no-cache-dir -r requirements.lock
COPY workspace/ /workspace/
