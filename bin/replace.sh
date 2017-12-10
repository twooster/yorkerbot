cd "$( dirname -- "$0" )/.."
./bin/build.sh
if docker inspect yorkerbot &>/dev/null ; then
  docker stop yorkerbot
  docker rm yorkerbot
fi
./bin/run.sh
