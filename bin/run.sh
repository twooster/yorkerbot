docker run \
  -d \
  --restart on-failure \
  -v "$( pwd )/.env:/app/src/.env" \
  --name yorkerbot \
  yorkerbot \
  run
