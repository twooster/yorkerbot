docker run \
  -d \
  --restart on-failure \
  -v /home/trumpyorker/env:/app/src/.env \
  --name yorkerbot \
  yorkerbot \
  run
