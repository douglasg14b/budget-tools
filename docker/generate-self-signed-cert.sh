#!/bin/sh
# Generates a self-signed TLS certificate at container start, then execs the real command.
#
# Why generate at runtime rather than bake into the image: a private key committed to an image
# layer is readable by anyone who can pull the image, and it would be identical across every
# deployment. Generating per-boot costs a few milliseconds and keeps the key out of the registry.
#
# Identity is deliberately not meaningful here. Caddy sits in front with `tls_insecure_skip_verify`,
# so this certificate exists to encrypt the hop, not to prove who the server is. The public,
# validated certificate is the one Caddy serves to browsers.
set -eu

CERT_DIR="${TLS_CERT_DIR:-/tls}"
CERT_PATH="${CERT_DIR}/tls.crt"
KEY_PATH="${CERT_DIR}/tls.key"
# Must cover however the proxy addresses this container. Caddy skips verification, but nginx's
# upstream check and any local curl still present SNI, and a mismatched SAN is a confusing failure.
CERT_HOSTS="${TLS_CERT_HOSTS:-DNS:localhost,DNS:api,DNS:web,IP:127.0.0.1}"

if [ ! -s "${CERT_PATH}" ] || [ ! -s "${KEY_PATH}" ]; then
    mkdir -p "${CERT_DIR}"
    # -nodes leaves the key unencrypted: there is no operator present at boot to type a passphrase.
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "${KEY_PATH}" \
        -out "${CERT_PATH}" \
        -days 3650 \
        -subj "/CN=budget-tools" \
        -addext "subjectAltName=${CERT_HOSTS}" \
        >/dev/null 2>&1
    chmod 600 "${KEY_PATH}"
    echo "Generated self-signed TLS certificate at ${CERT_PATH} (SAN: ${CERT_HOSTS})"
else
    echo "Reusing existing TLS certificate at ${CERT_PATH}"
fi

exec "$@"
