#!/usr/bin/env bash
set -e

SERVER_HOST="${SERVER_HOST:-localhost}"
CONNECTIONS=100
WARMUP_DURATION=30
BENCH_DURATION=30
RUNS=5
DISCARD_RUNS=1   # first N timed runs excluded from average (allow JIT/code-cache warmup)

echo "=== Mesh HTTP Benchmark Runner ==="
echo "Target:      $SERVER_HOST"
echo "Connections: $CONNECTIONS"
echo "Duration:    ${WARMUP_DURATION}s warmup + ${BENCH_DURATION}s x${RUNS} timed runs (first ${DISCARD_RUNS} discarded)"
echo ""

declare -A RESULT_RPS
declare -A RESULT_P50
declare -A RESULT_P99

declare -A PORTS
PORTS[Mesh]=3000
PORTS[Go]=3001
PORTS[Rust]=3002
PORTS[Elixir]=3003

wait_for_server() {
  local host=$1
  local port=$2
  local name=$3
  local max_wait=120
  local elapsed=0
  echo "Waiting for $name at $host:$port..."
  until curl -sf "http://$host:$port/text" > /dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ $elapsed -ge $max_wait ]; then
      echo "WARNING: $name ($host:$port) not reachable after ${max_wait}s" >&2
      return 1
    fi
  done
  echo "$name reachable"
  return 0
}

run_hey() {
  local url=$1
  local duration=$2
  # hey -c: concurrency, -z: duration, -t: per-request timeout (30s)
  hey -c "$CONNECTIONS" -z "${duration}s" -t 30 "$url" 2>/dev/null
}

for lang in Mesh Go Rust Elixir; do
  port="${PORTS[$lang]}"
  base_url="http://$SERVER_HOST:$port"

  echo ""
  echo "--- Benchmarking $lang (port $port) ---"

  if ! wait_for_server "$SERVER_HOST" "$port" "$lang"; then
    echo "$lang: UNAVAILABLE"
    for ep in text json; do
      RESULT_RPS["${lang}_${ep}"]="N/A"
      RESULT_P50["${lang}_${ep}"]="N/A"
      RESULT_P99["${lang}_${ep}"]="N/A"
    done
    continue
  fi

  for endpoint in text json; do
    url="$base_url/$endpoint"
    echo "  Endpoint: /$endpoint"

    # Warmup run (results discarded)
    run_hey "$url" "$WARMUP_DURATION" > /dev/null
    echo "  Warmup done. Running ${RUNS} timed runs..."

    rps_total=0
    counted=0
    last_p50="N/A"
    last_p99="N/A"

    for i in $(seq 1 $RUNS); do
      # hey outputs: "  Requests/sec: NNNN.NN" and "  50% in X.XXXX secs"
      output=$(run_hey "$url" "$BENCH_DURATION")
      rps=$(echo "$output" | grep "Requests/sec:" | awk '{print $2}' | tr -d '[:space:]')
      p50=$(echo "$output" | awk '/50% in/ {print $3, $4}')
      p99=$(echo "$output" | awk '/99% in/ {print $3, $4}')
      if [ "$i" -le "$DISCARD_RUNS" ]; then
        echo "    Run $i: ${rps:-N/A} req/s  p50=${p50:-N/A}  p99=${p99:-N/A}  [warmup — excluded]"
      else
        rps_total=$(echo "$rps_total + ${rps:-0}" | bc -l)
        counted=$((counted + 1))
        last_p50="${p50:-N/A}"
        last_p99="${p99:-N/A}"
        echo "    Run $i: ${rps:-N/A} req/s  p50=${p50:-N/A}  p99=${p99:-N/A}"
      fi
    done

    avg_rps=$(echo "scale=0; $rps_total / $counted" | bc -l)
    RESULT_RPS["${lang}_${endpoint}"]="$avg_rps"
    RESULT_P50["${lang}_${endpoint}"]="$last_p50"
    RESULT_P99["${lang}_${endpoint}"]="$last_p99"
  done
done

echo ""
echo "============================================================"
echo "== RESULTS (${CONNECTIONS} connections, ${BENCH_DURATION}s x$((RUNS - DISCARD_RUNS)) averaged, run 1 excluded) =="
echo "============================================================"
echo ""
printf "%-10s  %-12s  %-10s  %-10s\n" "Language" "Req/s" "p50" "p99"
printf "%-10s  %-12s  %-10s  %-10s\n" "--------" "-----" "---" "---"
echo ""
echo "/text endpoint:"
for lang in Mesh Go Rust Elixir; do
  printf "  %-10s  %-12s  %-10s  %-10s\n" \
    "$lang" \
    "${RESULT_RPS[${lang}_text]:-N/A}" \
    "${RESULT_P50[${lang}_text]:-N/A}" \
    "${RESULT_P99[${lang}_text]:-N/A}"
done

echo ""
echo "/json endpoint:"
for lang in Mesh Go Rust Elixir; do
  printf "  %-10s  %-12s  %-10s  %-10s\n" \
    "$lang" \
    "${RESULT_RPS[${lang}_json]:-N/A}" \
    "${RESULT_P50[${lang}_json]:-N/A}" \
    "${RESULT_P99[${lang}_json]:-N/A}"
done

echo ""
echo "Peak RSS: retrieve from server VM logs with:"
echo "  fly logs --machine <server-machine-id> --app <app> | grep '^RSS,'"
echo "============================================================"
