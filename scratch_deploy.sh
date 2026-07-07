#!/bin/bash
TD=/workspace/egypt-l1-memphis/tools/thebes-deploy/target/release/thebes-deploy
SELF=$$
ok=0
for i in $(seq 1 60); do
  # wait until no OTHER thebes-deploy BINARY is running (sibling sessions share the souk-deployer identity)
  for w in $(seq 1 180); do
    others=$(pgrep -fa "release/thebes-deploy --manifest" | grep -v "thebes-example-university" | wc -l)
    [ "$others" -eq 0 ] && break
    sleep 4
  done
  others=$(pgrep -fa "release/thebes-deploy --manifest" | grep -v "thebes-example-university" | wc -l)
  echo "=== attempt $i ($(date +%H:%M:%S)) other_deployers=$others ==="
  out=$($TD --manifest /workspace/thebes-example-university/thebes.toml --no-facts deploy web --skip-install 2>&1)
  echo "$out" | tail -3
  if echo "$out" | grep -q "deploy complete"; then echo "DEPLOY_OK"; ok=1; break; fi
  sleep $((3 + RANDOM % 8))
done
echo "FINAL ok=$ok"
