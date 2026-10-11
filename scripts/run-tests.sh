#!/usr/bin/env bash
set -euo pipefail
mapfile -t files < <(find dist/test -maxdepth 1 -name '*.test.js' -print | sort)
if [[ ${#files[@]} -eq 0 ]]; then
  echo 'No compiled test files found.' >&2
  exit 1
fi
# Each test file gets its own Node test-runner process. This avoids a runner
# hang observed when unrelated integration suites share a single test process,
# while keeping resource use bounded and ensuring a stuck file is reported.
log_dir="$(mktemp -d)"
export KHADAMAT_TEST_LOG_DIR="$log_dir"
export KHADAMAT_TEST_TIMEOUT_SECONDS="30"
printf '%s\0' "${files[@]}" | xargs -0 -n 1 -P 4 bash -c '
  file="$1"
  name="$(basename "$file")"
  if timeout "${KHADAMAT_TEST_TIMEOUT_SECONDS}s" node --test --test-force-exit --test-concurrency=1 "$file" > "$KHADAMAT_TEST_LOG_DIR/$name.log" 2>&1; then
    printf "PASS %s\n" "$name" >> "$KHADAMAT_TEST_LOG_DIR/results.txt"
  else
    code=$?
    printf "FAIL(%s) %s\n" "$code" "$name" >> "$KHADAMAT_TEST_LOG_DIR/results.txt"
  fi
  ' _

cat "$log_dir/results.txt" | sort
failures="$(grep -c '^FAIL' "$log_dir/results.txt" || true)"
tests="$(grep -hE '^# tests ' "$log_dir"/*.log | awk '{sum += $3} END {print sum+0}')"
passed="$(grep -hE '^# pass ' "$log_dir"/*.log | awk '{sum += $3} END {print sum+0}')"
failed="$(grep -hE '^# fail ' "$log_dir"/*.log | awk '{sum += $3} END {print sum+0}')"
echo "Test files: ${#files[@]} | Tests: $tests | Passed: $passed | Failed: $failed | Timed out/runner errors: $failures"
if [[ "$failures" -gt 0 || "$failed" -gt 0 || "$tests" -eq 0 || "$passed" -ne "$tests" ]]; then
  for log in "$log_dir"/*.log; do
    if grep -q '^not ok\|^Error:\|^FAIL' "$log" || ! grep -q '^# tests ' "$log"; then
      echo "--- $(basename "$log") ---" >&2
      cat "$log" >&2
    fi
  done
  exit 1
fi
printf 'All %s test files completed successfully in isolated processes.\n' "${#files[@]}"
