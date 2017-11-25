docker build \
  --build-arg env=${1:-production} \
  -t yorkerbot:latest \
  .
