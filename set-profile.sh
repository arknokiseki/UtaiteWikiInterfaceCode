if [ -n "$1" ]; then
  export NODE_PROJECT_PROFILE="$1"
  echo "Switched to profile " $NODE_PROJECT_PROFILE
else
  unset NODE_PROJECT_PROFILE
  echo "Reset profile to default"
fi