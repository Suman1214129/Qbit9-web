import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

/**
 * QBIT9 Phase 9 Load Test
 * Spec: 300 customers joining over 10 minutes with 6 staff counters calling.
 * Assert: p95 latency for join, get, and call_next under 500ms; error rate < 1%.
 */

const BASE_URL = __ENV.TARGET_URL || "http://localhost:3000";
const BRANCH_ID = __ENV.BRANCH_ID || "br_sbi_cp";
const SERVICE_ID = __ENV.SERVICE_ID || "svc_cash";

// Custom latency trends
const joinDuration = new Trend("join_duration", true);
const getTokenDuration = new Trend("get_token_duration", true);
const callNextDuration = new Trend("call_next_duration", true);
const errorRate = new Rate("error_rate");

export const options = {
  scenarios: {
    // 300 customers joining over 10 minutes
    customer_joins: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1m",
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { duration: "2m", target: 30 }, // ramp up to 30 joins/min
        { duration: "6m", target: 30 }, // sustain ~180 joins
        { duration: "2m", target: 10 }, // ramp down
      ],
      exec: "customerJoinFlow",
    },
    // 6 staff counters calling customers
    staff_counters: {
      executor: "constant-vus",
      vus: 6,
      duration: "10m",
      exec: "staffCounterFlow",
    },
    // Health and status monitoring
    health_monitor: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "10s",
      duration: "10m",
      preAllocatedVUs: 2,
      exec: "healthCheckFlow",
    },
  },
  thresholds: {
    join_duration: ["p(95)<500"],
    get_token_duration: ["p(95)<500"],
    call_next_duration: ["p(95)<500"],
    error_rate: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

export function customerJoinFlow() {
  const phone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  const now = Date.now();

  // 1. Mobile verification OTP request
  const otpRes = http.post(
    `${BASE_URL}/api/auth/phone`,
    JSON.stringify({ action: "request", phone }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(otpRes, { "otp request ok": (r) => r.status === 200 });

  // 2. Verify OTP
  const verifyRes = http.post(
    `${BASE_URL}/api/auth/phone`,
    JSON.stringify({ action: "verify", phone, code: "1234", name: "Load Tester" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(verifyRes, { "verify ok": (r) => r.status === 200 });

  // 3. Join queue
  const joinStart = Date.now();
  const joinPayload = JSON.stringify({
    branchId: BRANCH_ID,
    serviceId: SERVICE_ID,
    priority: [],
    proof: {
      lat: 28.6315,
      lng: 77.2167,
      accuracy: 25,
      capturedAt: now,
    },
  });

  const joinRes = http.post(`${BASE_URL}/api/queue/join`, joinPayload, {
    headers: { "Content-Type": "application/json" },
  });
  joinDuration.add(Date.now() - joinStart);

  const joinOk = check(joinRes, { "join status valid": (r) => r.status === 200 || r.status === 201 });
  if (!joinOk) errorRate.add(1);

  // 4. Token status polling
  sleep(1);
  const getStart = Date.now();
  const getRes = http.get(`${BASE_URL}/api/queue/active`);
  getTokenDuration.add(Date.now() - getStart);
  check(getRes, { "get token valid": (r) => r.status === 200 || r.status === 404 });
}

export function staffCounterFlow() {
  const counterNumber = (__VU % 6) + 1;
  sleep(5 + Math.random() * 5);

  const callStart = Date.now();
  const callRes = http.post(
    `${BASE_URL}/api/staff/call-next`,
    JSON.stringify({ counter: counterNumber, closeCurrentAs: "served" }),
    { headers: { "Content-Type": "application/json" } }
  );
  callNextDuration.add(Date.now() - callStart);
  check(callRes, { "call next valid": (r) => r.status === 200 || r.status === 404 });
}

export function healthCheckFlow() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    "health is 200": (r) => r.status === 200,
    "database connected": (r) => {
      try {
        return JSON.parse(r.body).database.status === "connected";
      } catch {
        return false;
      }
    },
  });
}
