// Minimal ISO-3166-1 country lookup.
//
// Keyed by ISO numeric code (matching the ids in public/world-atlas.json),
// with alpha-2, alpha-3, and common-name mappings so dashboard data can
// reference a country in whatever format it arrived in.

export interface CountryEntry {
  /** ISO 3166-1 numeric code, zero-padded to 3 chars. */
  numeric: string;
  /** ISO 3166-1 alpha-2 (e.g. "US"). */
  alpha2: string;
  /** ISO 3166-1 alpha-3 (e.g. "USA"). */
  alpha3: string;
  /** Common English name used by the Natural Earth atlas. */
  name: string;
}

// Curated list of the countries that appear in the world-110m atlas. This
// covers every populated country + most territories and is sufficient for
// honeypot / threat-intel visualization. Names match the atlas's Natural
// Earth entries so mapping by numeric id "just works".
export const COUNTRIES: CountryEntry[] = [
  { numeric: "004", alpha2: "AF", alpha3: "AFG", name: "Afghanistan" },
  { numeric: "008", alpha2: "AL", alpha3: "ALB", name: "Albania" },
  { numeric: "012", alpha2: "DZ", alpha3: "DZA", name: "Algeria" },
  { numeric: "024", alpha2: "AO", alpha3: "AGO", name: "Angola" },
  { numeric: "032", alpha2: "AR", alpha3: "ARG", name: "Argentina" },
  { numeric: "051", alpha2: "AM", alpha3: "ARM", name: "Armenia" },
  { numeric: "036", alpha2: "AU", alpha3: "AUS", name: "Australia" },
  { numeric: "040", alpha2: "AT", alpha3: "AUT", name: "Austria" },
  { numeric: "031", alpha2: "AZ", alpha3: "AZE", name: "Azerbaijan" },
  { numeric: "044", alpha2: "BS", alpha3: "BHS", name: "Bahamas" },
  { numeric: "050", alpha2: "BD", alpha3: "BGD", name: "Bangladesh" },
  { numeric: "112", alpha2: "BY", alpha3: "BLR", name: "Belarus" },
  { numeric: "056", alpha2: "BE", alpha3: "BEL", name: "Belgium" },
  { numeric: "084", alpha2: "BZ", alpha3: "BLZ", name: "Belize" },
  { numeric: "204", alpha2: "BJ", alpha3: "BEN", name: "Benin" },
  { numeric: "064", alpha2: "BT", alpha3: "BTN", name: "Bhutan" },
  { numeric: "068", alpha2: "BO", alpha3: "BOL", name: "Bolivia" },
  { numeric: "070", alpha2: "BA", alpha3: "BIH", name: "Bosnia and Herz." },
  { numeric: "072", alpha2: "BW", alpha3: "BWA", name: "Botswana" },
  { numeric: "076", alpha2: "BR", alpha3: "BRA", name: "Brazil" },
  { numeric: "096", alpha2: "BN", alpha3: "BRN", name: "Brunei" },
  { numeric: "100", alpha2: "BG", alpha3: "BGR", name: "Bulgaria" },
  { numeric: "854", alpha2: "BF", alpha3: "BFA", name: "Burkina Faso" },
  { numeric: "108", alpha2: "BI", alpha3: "BDI", name: "Burundi" },
  { numeric: "116", alpha2: "KH", alpha3: "KHM", name: "Cambodia" },
  { numeric: "120", alpha2: "CM", alpha3: "CMR", name: "Cameroon" },
  { numeric: "124", alpha2: "CA", alpha3: "CAN", name: "Canada" },
  { numeric: "140", alpha2: "CF", alpha3: "CAF", name: "Central African Rep." },
  { numeric: "148", alpha2: "TD", alpha3: "TCD", name: "Chad" },
  { numeric: "152", alpha2: "CL", alpha3: "CHL", name: "Chile" },
  { numeric: "156", alpha2: "CN", alpha3: "CHN", name: "China" },
  { numeric: "170", alpha2: "CO", alpha3: "COL", name: "Colombia" },
  { numeric: "178", alpha2: "CG", alpha3: "COG", name: "Congo" },
  { numeric: "188", alpha2: "CR", alpha3: "CRI", name: "Costa Rica" },
  { numeric: "384", alpha2: "CI", alpha3: "CIV", name: "Côte d'Ivoire" },
  { numeric: "191", alpha2: "HR", alpha3: "HRV", name: "Croatia" },
  { numeric: "192", alpha2: "CU", alpha3: "CUB", name: "Cuba" },
  { numeric: "196", alpha2: "CY", alpha3: "CYP", name: "Cyprus" },
  { numeric: "203", alpha2: "CZ", alpha3: "CZE", name: "Czechia" },
  { numeric: "180", alpha2: "CD", alpha3: "COD", name: "Dem. Rep. Congo" },
  { numeric: "208", alpha2: "DK", alpha3: "DNK", name: "Denmark" },
  { numeric: "262", alpha2: "DJ", alpha3: "DJI", name: "Djibouti" },
  { numeric: "214", alpha2: "DO", alpha3: "DOM", name: "Dominican Rep." },
  { numeric: "218", alpha2: "EC", alpha3: "ECU", name: "Ecuador" },
  { numeric: "818", alpha2: "EG", alpha3: "EGY", name: "Egypt" },
  { numeric: "222", alpha2: "SV", alpha3: "SLV", name: "El Salvador" },
  { numeric: "226", alpha2: "GQ", alpha3: "GNQ", name: "Eq. Guinea" },
  { numeric: "232", alpha2: "ER", alpha3: "ERI", name: "Eritrea" },
  { numeric: "233", alpha2: "EE", alpha3: "EST", name: "Estonia" },
  { numeric: "748", alpha2: "SZ", alpha3: "SWZ", name: "eSwatini" },
  { numeric: "231", alpha2: "ET", alpha3: "ETH", name: "Ethiopia" },
  { numeric: "238", alpha2: "FK", alpha3: "FLK", name: "Falkland Is." },
  { numeric: "242", alpha2: "FJ", alpha3: "FJI", name: "Fiji" },
  { numeric: "246", alpha2: "FI", alpha3: "FIN", name: "Finland" },
  { numeric: "250", alpha2: "FR", alpha3: "FRA", name: "France" },
  { numeric: "266", alpha2: "GA", alpha3: "GAB", name: "Gabon" },
  { numeric: "270", alpha2: "GM", alpha3: "GMB", name: "Gambia" },
  { numeric: "268", alpha2: "GE", alpha3: "GEO", name: "Georgia" },
  { numeric: "276", alpha2: "DE", alpha3: "DEU", name: "Germany" },
  { numeric: "288", alpha2: "GH", alpha3: "GHA", name: "Ghana" },
  { numeric: "300", alpha2: "GR", alpha3: "GRC", name: "Greece" },
  { numeric: "304", alpha2: "GL", alpha3: "GRL", name: "Greenland" },
  { numeric: "320", alpha2: "GT", alpha3: "GTM", name: "Guatemala" },
  { numeric: "324", alpha2: "GN", alpha3: "GIN", name: "Guinea" },
  { numeric: "624", alpha2: "GW", alpha3: "GNB", name: "Guinea-Bissau" },
  { numeric: "328", alpha2: "GY", alpha3: "GUY", name: "Guyana" },
  { numeric: "332", alpha2: "HT", alpha3: "HTI", name: "Haiti" },
  { numeric: "340", alpha2: "HN", alpha3: "HND", name: "Honduras" },
  { numeric: "348", alpha2: "HU", alpha3: "HUN", name: "Hungary" },
  { numeric: "352", alpha2: "IS", alpha3: "ISL", name: "Iceland" },
  { numeric: "356", alpha2: "IN", alpha3: "IND", name: "India" },
  { numeric: "360", alpha2: "ID", alpha3: "IDN", name: "Indonesia" },
  { numeric: "364", alpha2: "IR", alpha3: "IRN", name: "Iran" },
  { numeric: "368", alpha2: "IQ", alpha3: "IRQ", name: "Iraq" },
  { numeric: "372", alpha2: "IE", alpha3: "IRL", name: "Ireland" },
  { numeric: "376", alpha2: "IL", alpha3: "ISR", name: "Israel" },
  { numeric: "380", alpha2: "IT", alpha3: "ITA", name: "Italy" },
  { numeric: "388", alpha2: "JM", alpha3: "JAM", name: "Jamaica" },
  { numeric: "392", alpha2: "JP", alpha3: "JPN", name: "Japan" },
  { numeric: "400", alpha2: "JO", alpha3: "JOR", name: "Jordan" },
  { numeric: "398", alpha2: "KZ", alpha3: "KAZ", name: "Kazakhstan" },
  { numeric: "404", alpha2: "KE", alpha3: "KEN", name: "Kenya" },
  { numeric: "408", alpha2: "KP", alpha3: "PRK", name: "North Korea" },
  { numeric: "410", alpha2: "KR", alpha3: "KOR", name: "South Korea" },
  { numeric: "414", alpha2: "KW", alpha3: "KWT", name: "Kuwait" },
  { numeric: "417", alpha2: "KG", alpha3: "KGZ", name: "Kyrgyzstan" },
  { numeric: "418", alpha2: "LA", alpha3: "LAO", name: "Laos" },
  { numeric: "428", alpha2: "LV", alpha3: "LVA", name: "Latvia" },
  { numeric: "422", alpha2: "LB", alpha3: "LBN", name: "Lebanon" },
  { numeric: "426", alpha2: "LS", alpha3: "LSO", name: "Lesotho" },
  { numeric: "430", alpha2: "LR", alpha3: "LBR", name: "Liberia" },
  { numeric: "434", alpha2: "LY", alpha3: "LBY", name: "Libya" },
  { numeric: "440", alpha2: "LT", alpha3: "LTU", name: "Lithuania" },
  { numeric: "442", alpha2: "LU", alpha3: "LUX", name: "Luxembourg" },
  { numeric: "450", alpha2: "MG", alpha3: "MDG", name: "Madagascar" },
  { numeric: "454", alpha2: "MW", alpha3: "MWI", name: "Malawi" },
  { numeric: "458", alpha2: "MY", alpha3: "MYS", name: "Malaysia" },
  { numeric: "466", alpha2: "ML", alpha3: "MLI", name: "Mali" },
  { numeric: "478", alpha2: "MR", alpha3: "MRT", name: "Mauritania" },
  { numeric: "484", alpha2: "MX", alpha3: "MEX", name: "Mexico" },
  { numeric: "498", alpha2: "MD", alpha3: "MDA", name: "Moldova" },
  { numeric: "496", alpha2: "MN", alpha3: "MNG", name: "Mongolia" },
  { numeric: "499", alpha2: "ME", alpha3: "MNE", name: "Montenegro" },
  { numeric: "504", alpha2: "MA", alpha3: "MAR", name: "Morocco" },
  { numeric: "508", alpha2: "MZ", alpha3: "MOZ", name: "Mozambique" },
  { numeric: "104", alpha2: "MM", alpha3: "MMR", name: "Myanmar" },
  { numeric: "516", alpha2: "NA", alpha3: "NAM", name: "Namibia" },
  { numeric: "524", alpha2: "NP", alpha3: "NPL", name: "Nepal" },
  { numeric: "528", alpha2: "NL", alpha3: "NLD", name: "Netherlands" },
  { numeric: "540", alpha2: "NC", alpha3: "NCL", name: "New Caledonia" },
  { numeric: "554", alpha2: "NZ", alpha3: "NZL", name: "New Zealand" },
  { numeric: "558", alpha2: "NI", alpha3: "NIC", name: "Nicaragua" },
  { numeric: "562", alpha2: "NE", alpha3: "NER", name: "Niger" },
  { numeric: "566", alpha2: "NG", alpha3: "NGA", name: "Nigeria" },
  { numeric: "807", alpha2: "MK", alpha3: "MKD", name: "North Macedonia" },
  { numeric: "578", alpha2: "NO", alpha3: "NOR", name: "Norway" },
  { numeric: "512", alpha2: "OM", alpha3: "OMN", name: "Oman" },
  { numeric: "586", alpha2: "PK", alpha3: "PAK", name: "Pakistan" },
  { numeric: "275", alpha2: "PS", alpha3: "PSE", name: "Palestine" },
  { numeric: "591", alpha2: "PA", alpha3: "PAN", name: "Panama" },
  { numeric: "598", alpha2: "PG", alpha3: "PNG", name: "Papua New Guinea" },
  { numeric: "600", alpha2: "PY", alpha3: "PRY", name: "Paraguay" },
  { numeric: "604", alpha2: "PE", alpha3: "PER", name: "Peru" },
  { numeric: "608", alpha2: "PH", alpha3: "PHL", name: "Philippines" },
  { numeric: "616", alpha2: "PL", alpha3: "POL", name: "Poland" },
  { numeric: "620", alpha2: "PT", alpha3: "PRT", name: "Portugal" },
  { numeric: "630", alpha2: "PR", alpha3: "PRI", name: "Puerto Rico" },
  { numeric: "634", alpha2: "QA", alpha3: "QAT", name: "Qatar" },
  { numeric: "642", alpha2: "RO", alpha3: "ROU", name: "Romania" },
  { numeric: "643", alpha2: "RU", alpha3: "RUS", name: "Russia" },
  { numeric: "646", alpha2: "RW", alpha3: "RWA", name: "Rwanda" },
  { numeric: "682", alpha2: "SA", alpha3: "SAU", name: "Saudi Arabia" },
  { numeric: "686", alpha2: "SN", alpha3: "SEN", name: "Senegal" },
  { numeric: "688", alpha2: "RS", alpha3: "SRB", name: "Serbia" },
  { numeric: "694", alpha2: "SL", alpha3: "SLE", name: "Sierra Leone" },
  { numeric: "703", alpha2: "SK", alpha3: "SVK", name: "Slovakia" },
  { numeric: "705", alpha2: "SI", alpha3: "SVN", name: "Slovenia" },
  { numeric: "090", alpha2: "SB", alpha3: "SLB", name: "Solomon Is." },
  { numeric: "706", alpha2: "SO", alpha3: "SOM", name: "Somalia" },
  { numeric: "710", alpha2: "ZA", alpha3: "ZAF", name: "South Africa" },
  { numeric: "728", alpha2: "SS", alpha3: "SSD", name: "S. Sudan" },
  { numeric: "724", alpha2: "ES", alpha3: "ESP", name: "Spain" },
  { numeric: "144", alpha2: "LK", alpha3: "LKA", name: "Sri Lanka" },
  { numeric: "729", alpha2: "SD", alpha3: "SDN", name: "Sudan" },
  { numeric: "740", alpha2: "SR", alpha3: "SUR", name: "Suriname" },
  { numeric: "752", alpha2: "SE", alpha3: "SWE", name: "Sweden" },
  { numeric: "756", alpha2: "CH", alpha3: "CHE", name: "Switzerland" },
  { numeric: "760", alpha2: "SY", alpha3: "SYR", name: "Syria" },
  { numeric: "158", alpha2: "TW", alpha3: "TWN", name: "Taiwan" },
  { numeric: "762", alpha2: "TJ", alpha3: "TJK", name: "Tajikistan" },
  { numeric: "834", alpha2: "TZ", alpha3: "TZA", name: "Tanzania" },
  { numeric: "764", alpha2: "TH", alpha3: "THA", name: "Thailand" },
  { numeric: "626", alpha2: "TL", alpha3: "TLS", name: "Timor-Leste" },
  { numeric: "768", alpha2: "TG", alpha3: "TGO", name: "Togo" },
  { numeric: "780", alpha2: "TT", alpha3: "TTO", name: "Trinidad and Tobago" },
  { numeric: "788", alpha2: "TN", alpha3: "TUN", name: "Tunisia" },
  { numeric: "792", alpha2: "TR", alpha3: "TUR", name: "Turkey" },
  { numeric: "795", alpha2: "TM", alpha3: "TKM", name: "Turkmenistan" },
  { numeric: "800", alpha2: "UG", alpha3: "UGA", name: "Uganda" },
  { numeric: "804", alpha2: "UA", alpha3: "UKR", name: "Ukraine" },
  { numeric: "784", alpha2: "AE", alpha3: "ARE", name: "United Arab Emirates" },
  { numeric: "826", alpha2: "GB", alpha3: "GBR", name: "United Kingdom" },
  { numeric: "840", alpha2: "US", alpha3: "USA", name: "United States of America" },
  { numeric: "858", alpha2: "UY", alpha3: "URY", name: "Uruguay" },
  { numeric: "860", alpha2: "UZ", alpha3: "UZB", name: "Uzbekistan" },
  { numeric: "548", alpha2: "VU", alpha3: "VUT", name: "Vanuatu" },
  { numeric: "862", alpha2: "VE", alpha3: "VEN", name: "Venezuela" },
  { numeric: "704", alpha2: "VN", alpha3: "VNM", name: "Vietnam" },
  { numeric: "887", alpha2: "YE", alpha3: "YEM", name: "Yemen" },
  { numeric: "894", alpha2: "ZM", alpha3: "ZMB", name: "Zambia" },
  { numeric: "716", alpha2: "ZW", alpha3: "ZWE", name: "Zimbabwe" },
  { numeric: "732", alpha2: "EH", alpha3: "ESH", name: "W. Sahara" },
  // Common English aliases -- mapped via the name index below to the
  // atlas's canonical Natural Earth names above.
];

// Build lookup maps once at module load. All keys are uppercased.
const byAlpha2 = new Map<string, CountryEntry>();
const byAlpha3 = new Map<string, CountryEntry>();
const byNumeric = new Map<string, CountryEntry>();
const byName = new Map<string, CountryEntry>();

for (const c of COUNTRIES) {
  byAlpha2.set(c.alpha2.toUpperCase(), c);
  byAlpha3.set(c.alpha3.toUpperCase(), c);
  byNumeric.set(c.numeric.replace(/^0+/, ""), c);
  byNumeric.set(c.numeric, c);
  byName.set(c.name.toUpperCase(), c);
}

// Common aliases that the Natural Earth atlas labels differently than
// everyday usage. Add on demand.
const aliases: [string, string][] = [
  ["USA", "840"],
  ["UNITED STATES", "840"],
  ["U.S.A.", "840"],
  ["U.S.", "840"],
  ["AMERICA", "840"],
  ["UNITED KINGDOM", "826"],
  ["UK", "826"],
  ["GREAT BRITAIN", "826"],
  ["BRITAIN", "826"],
  ["ENGLAND", "826"],
  ["SOUTH KOREA", "410"],
  ["KOREA", "410"],
  ["KOREA, REP.", "410"],
  ["NORTH KOREA", "408"],
  ["KOREA, DEM. PEOPLE'S REP.", "408"],
  ["RUSSIA", "643"],
  ["RUSSIAN FEDERATION", "643"],
  ["IVORY COAST", "384"],
  ["CZECH REPUBLIC", "203"],
  ["CZECHIA", "203"],
  ["BOSNIA AND HERZEGOVINA", "070"],
  ["CONGO (DRC)", "180"],
  ["DEMOCRATIC REPUBLIC OF THE CONGO", "180"],
  ["DR CONGO", "180"],
  ["CONGO (BRAZZAVILLE)", "178"],
  ["REPUBLIC OF THE CONGO", "178"],
  ["EAST TIMOR", "626"],
  ["SWAZILAND", "748"],
  ["MACEDONIA", "807"],
];
for (const [alias, numeric] of aliases) {
  const e = byNumeric.get(numeric);
  if (e) byName.set(alias.toUpperCase(), e);
}

/**
 * Resolve any of alpha-2 / alpha-3 / numeric code / common name to a
 * country entry. Case-insensitive, whitespace-trimmed.
 */
export function resolveCountry(raw: unknown): CountryEntry | null {
  if (raw == null) return null;
  const key = String(raw).trim().toUpperCase();
  if (!key) return null;
  if (/^\d+$/.test(key)) return byNumeric.get(key) ?? null;
  if (key.length === 2) return byAlpha2.get(key) ?? null;
  if (key.length === 3) return byAlpha3.get(key) ?? null;
  return byName.get(key) ?? null;
}
