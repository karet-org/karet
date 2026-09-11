// Traffic Analytics: the showcase template.
//
// Exercises every node type and every option the graph supports, so it doubles
// as a worked example and as a fixture that has to keep parsing:
//
//   - JSON source     NDJSON with dotted/indexed paths and a record_filter
//   - CSV source      a second edge, unioned into the same table
//   - from_unix       epoch seconds to a date
//   - Mapping.where   health probes never reach the warehouse
//   - Dimension       inline substring (multi-value, passthrough), inline
//                     substring (null miss), file-backed exact (literal miss)
//   - Analytic table  hive partitioning plus dedup keys

import type { AstNode, PipelineConfig } from "@/lib/types/config";

/** `request.uri` trimmed of its query string, reused by several columns. */
const PATH_ONLY: AstNode = {
  kind: "coalesce",
  args: [
    { kind: "substring", input: { kind: "col", name: "uri" }, start: 0, length: 120 },
    { kind: "str", value: "/" },
  ],
};

const EVENT_DATE: AstNode = { kind: "from_unix", input: { kind: "col", name: "ts" } };

const trafficPipeline: PipelineConfig = {
  version: 1,
  name: "Traffic Analytics",
  source_containers: [
    {
      id: "caddy_access_raw",
      name: "Caddy Access Log",
      // Caddy's own JSON log, read as-is: no shipper, no flattening step.
      path_prefix: "caddy_access/",
      format: "ndjson",
      record_filter: {
        kind: "eq",
        left: { kind: "col", name: "msg" },
        right: { kind: "str", value: "handled request" },
      },
      schema: [
        // The filter runs over extracted columns, so `msg` is declared even
        // though no mapping column uses it.
        { name: "msg", type: "string", path: "msg" },
        { name: "ts", type: "float64", path: "ts" },
        { name: "host", type: "string", path: "request.host" },
        { name: "method", type: "string", path: "request.method" },
        { name: "uri", type: "string", path: "request.uri" },
        { name: "status", type: "int64", path: "status" },
        { name: "duration", type: "float64", path: "duration" },
        { name: "size", type: "int64", path: "size" },
        { name: "client_ip", type: "string", path: "request.remote_ip" },
        { name: "country", type: "string", path: "request.headers.Cf-Ipcountry[0]" },
        { name: "user_agent", type: "string", path: "request.headers.User-Agent[0]" },
      ],
    },
    {
      id: "edge_access_raw",
      name: "Edge Access Log",
      // A CDN export with its own column names, unioned into `requests`.
      path_prefix: "edge_access/",
      schema: [
        { name: "epoch", type: "float64" },
        { name: "site", type: "string" },
        { name: "verb", type: "string" },
        { name: "url", type: "string" },
        { name: "code", type: "int64" },
        { name: "elapsed_ms", type: "float64" },
        { name: "bytes_sent", type: "int64" },
        { name: "ip", type: "string" },
        { name: "cc", type: "string" },
        { name: "agent", type: "string" },
      ],
    },
  ],
  dimensions: [
    {
      // Two value columns from one match: a dim_ref picks which it wants.
      id: "services",
      name: "Services",
      match: "keyword_substring",
      case_insensitive: true,
      // Unlisted hosts describe themselves.
      on_miss: "passthrough",
      rows: {
        values: ["service", "team"],
        rows: [
          { patterns: ["etl."], values: ["Karet", "Data"] },
          { patterns: ["grafana.", "prometheus."], values: ["Observability", "Platform"] },
          { patterns: ["git."], values: ["Forge", "Platform"] },
          { patterns: ["photos.", "immich."], values: ["Photos", "Home"] },
        ],
      },
    },
    {
      // A miss is null here, which is the point: null means "not a crawler".
      id: "crawlers",
      name: "Crawlers",
      match: "keyword_substring",
      case_insensitive: true,
      on_miss: "null",
      rows: {
        values: ["crawler"],
        rows: [
          { patterns: ["googlebot"], values: ["Google"] },
          { patterns: ["bingbot"], values: ["Bing"] },
          { patterns: ["ahrefsbot", "semrushbot", "mj12bot"], values: ["SEO"] },
          { patterns: ["gptbot", "claudebot", "ccbot"], values: ["AI"] },
          // Catch-all for the long tail, ranked below the named ones.
          { patterns: ["bot", "crawler", "spider"], values: ["Other"], priority: -10 },
        ],
      },
    },
    {
      // Too many rows to hand-edit, so the table lives in the lake.
      id: "countries",
      name: "Countries",
      match: "exact",
      case_insensitive: true,
      on_miss: { literal: "Unknown" },
      rows: {
        path_prefix: "dim_countries/",
        key: "code",
        values: ["country_name", "region"],
      },
    },
  ],
  mappings: [
    {
      id: "caddy_mapping",
      name: "Caddy Mapping",
      source_container_id: "caddy_access_raw",
      analytic_table_id: "requests",
      // Uptime probes are noise in every panel, so they never land.
      where: {
        kind: "and",
        left: {
          kind: "ne",
          left: { kind: "col", name: "path" },
          right: { kind: "str", value: "/health" },
        },
        right: {
          kind: "ne",
          left: { kind: "col", name: "path" },
          right: { kind: "str", value: "/metrics" },
        },
      },
      columns: [
        { name: "date", expr: EVENT_DATE },
        {
          name: "month",
          expr: { kind: "substring", input: { kind: "cast", input: EVENT_DATE, to: "string" }, start: 0, length: 7 },
        },
        { name: "host", expr: { kind: "col", name: "host" } },
        {
          name: "service",
          expr: { kind: "dim_ref", dim_id: "services", value: "service", input: { kind: "col", name: "host" } },
        },
        {
          name: "team",
          expr: { kind: "dim_ref", dim_id: "services", value: "team", input: { kind: "col", name: "host" } },
        },
        { name: "method", expr: { kind: "col", name: "method" } },
        { name: "path", expr: PATH_ONLY },
        { name: "status", expr: { kind: "col", name: "status" } },
        {
          name: "duration_ms",
          expr: { kind: "mul", left: { kind: "col", name: "duration" }, right: { kind: "num", value: 1000 } },
        },
        { name: "bytes", expr: { kind: "col", name: "size" } },
        { name: "client_ip", expr: { kind: "col", name: "client_ip" } },
        {
          name: "country_name",
          expr: {
            kind: "dim_ref",
            dim_id: "countries",
            value: "country_name",
            input: { kind: "col", name: "country" },
          },
        },
        {
          name: "region",
          expr: { kind: "dim_ref", dim_id: "countries", value: "region", input: { kind: "col", name: "country" } },
        },
        {
          name: "crawler",
          expr: { kind: "dim_ref", dim_id: "crawlers", input: { kind: "col", name: "user_agent" } },
        },
      ],
    },
    {
      id: "edge_mapping",
      name: "Edge Mapping",
      source_container_id: "edge_access_raw",
      analytic_table_id: "requests",
      columns: [
        { name: "date", expr: { kind: "from_unix", input: { kind: "col", name: "epoch" } } },
        {
          name: "month",
          expr: {
            kind: "substring",
            input: {
              kind: "cast",
              input: { kind: "from_unix", input: { kind: "col", name: "epoch" } },
              to: "string",
            },
            start: 0,
            length: 7,
          },
        },
        { name: "host", expr: { kind: "col", name: "site" } },
        {
          name: "service",
          expr: { kind: "dim_ref", dim_id: "services", value: "service", input: { kind: "col", name: "site" } },
        },
        {
          name: "team",
          expr: { kind: "dim_ref", dim_id: "services", value: "team", input: { kind: "col", name: "site" } },
        },
        { name: "method", expr: { kind: "col", name: "verb" } },
        { name: "path", expr: { kind: "col", name: "url" } },
        { name: "status", expr: { kind: "col", name: "code" } },
        { name: "duration_ms", expr: { kind: "col", name: "elapsed_ms" } },
        { name: "bytes", expr: { kind: "col", name: "bytes_sent" } },
        { name: "client_ip", expr: { kind: "col", name: "ip" } },
        {
          name: "country_name",
          expr: { kind: "dim_ref", dim_id: "countries", value: "country_name", input: { kind: "col", name: "cc" } },
        },
        {
          name: "region",
          expr: { kind: "dim_ref", dim_id: "countries", value: "region", input: { kind: "col", name: "cc" } },
        },
        {
          name: "crawler",
          expr: { kind: "dim_ref", dim_id: "crawlers", input: { kind: "col", name: "agent" } },
        },
      ],
    },
  ],
  analytic_tables: [
    {
      id: "requests",
      name: "Requests",
      schema: [
        { name: "date", type: "date" },
        { name: "month", type: "string" },
        { name: "host", type: "string" },
        { name: "service", type: "string" },
        { name: "team", type: "string" },
        { name: "method", type: "string" },
        { name: "path", type: "string" },
        { name: "status", type: "int64" },
        { name: "duration_ms", type: "float64" },
        { name: "bytes", type: "int64" },
        { name: "client_ip", type: "string" },
        { name: "country_name", type: "string" },
        { name: "region", type: "string" },
        { name: "crawler", type: "string" },
      ],
      partition_keys: ["month"],
      // Re-uploading a log slice must not double-count it.
      dedup_keys: ["date", "client_ip", "path", "status", "duration_ms"],
    },
  ],
};

/** ISO codes for the file-backed `countries` dimension. */
const COUNTRIES_CSV = `code,country_name,region
AU,Australia,Oceania
BR,Brazil,Americas
CA,Canada,Americas
CN,China,Asia
DE,Germany,Europe
FR,France,Europe
GB,United Kingdom,Europe
HK,Hong Kong,Asia
ID,Indonesia,Asia
IN,India,Asia
JP,Japan,Asia
KR,South Korea,Asia
NL,Netherlands,Europe
PL,Poland,Europe
RU,Russia,Europe
SG,Singapore,Asia
TW,Taiwan,Asia
UA,Ukraine,Europe
US,United States,Americas
VN,Vietnam,Asia
`;

/**
 * Caddy-shaped NDJSON. Includes a non-request line the `record_filter` drops,
 * health probes the mapping's `where` drops, crawler user agents, an unlisted
 * country code that falls to the `on_miss` literal, and an unlisted host that
 * passes through.
 */
const CADDY_NDJSON = [
  { level: "info", ts: 1789000000.12, msg: "handled request", request: { host: "etl.joeyshi.xyz", method: "GET", uri: "/p/traffic/dashboards", remote_ip: "203.0.113.10", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["CA"] } }, duration: 0.042, size: 18324, status: 200 },
  { level: "info", ts: 1789000100.44, msg: "handled request", request: { host: "etl.joeyshi.xyz", method: "GET", uri: "/health", remote_ip: "10.0.0.5", headers: { "User-Agent": ["kube-probe/1.29"], "Cf-Ipcountry": ["CA"] } }, duration: 0.001, size: 12, status: 200 },
  { level: "info", ts: 1789000200.91, msg: "handled request", request: { host: "grafana.joeyshi.xyz", method: "GET", uri: "/d/abc/overview?from=now-6h", remote_ip: "198.51.100.7", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["US"] } }, duration: 0.310, size: 240192, status: 200 },
  { level: "info", ts: 1789000300.05, msg: "handled request", request: { host: "git.joeyshi.xyz", method: "POST", uri: "/api/v1/repos/x/y/hooks", remote_ip: "192.0.2.44", headers: { "User-Agent": ["GitHub-Hookshot/abc"], "Cf-Ipcountry": ["US"] } }, duration: 0.088, size: 512, status: 201 },
  { level: "info", ts: 1789000400.77, msg: "handled request", request: { host: "git.joeyshi.xyz", method: "GET", uri: "/x/y/archive/main.zip", remote_ip: "203.0.113.201", headers: { "User-Agent": ["Mozilla/5.0 (compatible; Googlebot/2.1)"], "Cf-Ipcountry": ["US"] } }, duration: 1.204, size: 8419233, status: 200 },
  { level: "info", ts: 1789000500.33, msg: "handled request", request: { host: "photos.joeyshi.xyz", method: "GET", uri: "/api/assets/thumb/1234", remote_ip: "203.0.113.10", headers: { "User-Agent": ["Immich/1.0"], "Cf-Ipcountry": ["CA"] } }, duration: 0.067, size: 44210, status: 200 },
  { level: "info", ts: 1789000600.19, msg: "handled request", request: { host: "photos.joeyshi.xyz", method: "GET", uri: "/api/assets/original/9999", remote_ip: "45.155.205.99", headers: { "User-Agent": ["AhrefsBot/7.0"], "Cf-Ipcountry": ["T1"] } }, duration: 0.512, size: 1044210, status: 403 },
  { level: "info", ts: 1789000700.62, msg: "handled request", request: { host: "vault.joeyshi.xyz", method: "GET", uri: "/", remote_ip: "203.0.113.77", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["DE"] } }, duration: 0.145, size: 9182, status: 502 },
  { level: "info", ts: 1789000800.10, msg: "handled request", request: { host: "etl.joeyshi.xyz", method: "GET", uri: "/metrics", remote_ip: "10.0.0.9", headers: { "User-Agent": ["Prometheus/2.51"], "Cf-Ipcountry": ["CA"] } }, duration: 0.004, size: 88213, status: 200 },
  { level: "info", ts: 1789000900.48, msg: "handled request", request: { host: "etl.joeyshi.xyz", method: "POST", uri: "/api/p/traffic/jobs", remote_ip: "203.0.113.10", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["CA"] } }, duration: 0.902, size: 331, status: 200 },
  { level: "warn", ts: 1789000950.00, msg: "tls handshake error", request: { host: "etl.joeyshi.xyz" } },
  { level: "info", ts: 1789087300.71, msg: "handled request", request: { host: "grafana.joeyshi.xyz", method: "GET", uri: "/api/datasources", remote_ip: "198.51.100.7", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["US"] } }, duration: 0.211, size: 4412, status: 200 },
  { level: "info", ts: 1789087400.26, msg: "handled request", request: { host: "git.joeyshi.xyz", method: "GET", uri: "/explore/repos", remote_ip: "51.15.63.12", headers: { "User-Agent": ["GPTBot/1.1"], "Cf-Ipcountry": ["FR"] } }, duration: 0.402, size: 62114, status: 200 },
  { level: "info", ts: 1789087500.83, msg: "handled request", request: { host: "etl.joeyshi.xyz", method: "GET", uri: "/p/traffic/graph", remote_ip: "203.0.113.10", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["CA"] } }, duration: 0.126, size: 20481, status: 200 },
  { level: "info", ts: 1789087600.14, msg: "handled request", request: { host: "photos.joeyshi.xyz", method: "GET", uri: "/api/search", remote_ip: "1.32.240.6", headers: { "User-Agent": ["Mozilla/5.0"], "Cf-Ipcountry": ["SG"] } }, duration: 0.233, size: 15220, status: 500 },
]
  .map((r) => JSON.stringify(r))
  .join("\n") + "\n";

/** The CDN export that unions into the same table. */
const EDGE_CSV = `epoch,site,verb,url,code,elapsed_ms,bytes_sent,ip,cc,agent
1789000010,cdn.joeyshi.xyz,GET,/assets/app.css,200,12.4,18220,203.0.113.30,CA,Mozilla/5.0
1789000110,cdn.joeyshi.xyz,GET,/assets/app.js,200,31.9,244102,198.51.100.22,US,Mozilla/5.0
1789000210,cdn.joeyshi.xyz,GET,/assets/hero.webp,200,88.1,912233,203.0.113.31,GB,Mozilla/5.0
1789000310,cdn.joeyshi.xyz,GET,/assets/missing.png,404,4.2,512,45.155.205.99,XX,SemrushBot/7.0
1789087410,cdn.joeyshi.xyz,GET,/assets/app.js,200,29.7,244102,203.0.113.32,JP,Mozilla/5.0
1789087510,cdn.joeyshi.xyz,GET,/assets/app.css,500,102.3,120,203.0.113.33,IN,Mozilla/5.0
`;

const trafficDashboardYaml = `version: 2
id: traffic_overview
name: Traffic Overview

filters:
  - name: service
    kind: dropdown
    label: Service
    options_sql: |
      SELECT DISTINCT service FROM requests
      WHERE service IS NOT NULL ORDER BY 1

panels:
  - kind: kpi
    title: Requests
    query: |
      SELECT count(*) AS n FROM requests
      WHERE service = coalesce($service, service)
    value: n
    icon: chart
    grid: { span: 2 }

  - kind: kpi
    title: Server Errors
    query: |
      SELECT count(*) AS n FROM requests
      WHERE status >= 500 AND service = coalesce($service, service)
    value: n
    icon: chart
    grid: { span: 2 }

  - kind: kpi
    title: Mean Duration (ms)
    query: |
      SELECT round(avg(duration_ms), 1) AS ms FROM requests
      WHERE service = coalesce($service, service)
    value: ms
    icon: chart
    grid: { span: 2 }

  - kind: line
    title: Requests Per Day
    query: |
      SELECT date, count(*) AS requests FROM requests
      WHERE service = coalesce($service, service)
      GROUP BY 1 ORDER BY 1
    x: date
    y: requests
    grid: { span: full }

  - kind: bar
    title: Crawler Hits Per Day
    query: |
      SELECT date, count(*) AS crawlers FROM requests
      WHERE crawler IS NOT NULL AND service = coalesce($service, service)
      GROUP BY 1 ORDER BY 1
    x: date
    y: crawlers
    grid: { span: 3 }

  - kind: bar
    title: Bytes By Region
    query: |
      SELECT region, sum(bytes) AS bytes FROM requests
      GROUP BY 1 ORDER BY bytes DESC
    x: region
    y: bytes
    grid: { span: 3 }

  - kind: table
    title: Slowest Paths
    query: |
      SELECT path, count(*) AS hits, round(median(duration_ms), 1) AS p50_ms
      FROM requests
      WHERE service = coalesce($service, service)
      GROUP BY 1 ORDER BY p50_ms DESC
    page_size: 10
    grid: { span: full }

layout:
  columns: 6
  gap: 1rem
`;

export const TRAFFIC_TEMPLATE_FILES = {
  files: { "pipeline.json": trafficPipeline },
  rawFiles: {
    "caddy_access/access.ndjson": CADDY_NDJSON,
    "edge_access/edge.csv": EDGE_CSV,
    "dim_countries/countries.csv": COUNTRIES_CSV,
    "dashboards/traffic_overview.yaml": trafficDashboardYaml,
  },
};

export { trafficPipeline };
