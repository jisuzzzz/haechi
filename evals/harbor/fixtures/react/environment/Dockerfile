FROM node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
RUN apt-get update && apt-get install -y --no-install-recommends python3 git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY workspace/ /workspace/
RUN npm ci --no-audit --no-fund \
    && mkdir -p /opt/fixture-deps \
    && cp package.json package-lock.json /opt/fixture-deps/ \
    && mv node_modules /opt/fixture-deps/node_modules \
    && ln -s /opt/fixture-deps/node_modules node_modules \
    && git init -q -b main && git add . && git -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm 'Initial fixture'
