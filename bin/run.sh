docker run \
  -d \
  --restart on-failure \
  --env-file "$( pwd )/.env" \
  --name yorkerbot \
  yorkerbot \
  run
