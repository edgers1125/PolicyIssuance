import { formatPHP } from "../utils/currency";
import bethelLogo from "../assets/bethel-logo.png";

const BRANCH_HEAD_NAME = "JOHN CALVIN NAVARRO";

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return { date: "", time: "" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  };
}

// One legal-size (8.5x14in) page, sized in real physical units so the on-screen
// preview reads as an actual sheet rather than an arbitrary web block. Real
// pagination when printing is left entirely to the browser — this only marks
// where a new page should start; it never clips content itself.
function Page({ children, breakBefore }) {
  return (
    <div
      className="policy-schedule-page"
      style={{
        position: "relative",
        width: "8.5in",
        minHeight: "14in",
        margin: breakBefore ? "24px auto 0" : "0 auto",
        padding: 40,
        boxSizing: "border-box",
        background: "#fff",
        breakBefore: breakBefore ? "page" : "auto",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${bethelLogo})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "60%",
          opacity: 0.06,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function SignatureBlock() {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontWeight: 700 }}>BETHEL GENERAL INSURANCE AND SURETY CORP.</div>
      <div style={{ marginTop: 36, fontWeight: 700 }}>{BRANCH_HEAD_NAME}</div>
      <div style={{ borderTop: "1px solid #111", marginTop: 4, paddingTop: 4, fontSize: 10 }}>BRANCH HEAD</div>
      <div style={{ fontSize: 10, marginTop: 2 }}>AUTHORIZED SIGNATURE</div>
    </div>
  );
}

function VehicleBlock({ vehicle }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
      <tbody>
        <tr>
          <td style={{ width: "33%" }}>
            <strong>Model:</strong> {vehicle.year_model || "—"}
          </td>
          <td style={{ width: "34%" }}>
            <strong>MV File No.:</strong> {vehicle.mv_file_no}
          </td>
          <td style={{ width: "33%" }}>
            <strong>Plate No.:</strong> {vehicle.plate_number}
          </td>
        </tr>
        <tr>
          <td>
            <strong>Vehicle type:</strong> {vehicle.vehicle_type || "—"}
          </td>
          <td>
            <strong>Make:</strong> {vehicle.make || "—"}
          </td>
          <td>
            <strong>Color:</strong> {vehicle.color || "—"}
          </td>
        </tr>
        <tr>
          <td>
            <strong>Engine No.:</strong> {vehicle.engine_number}
          </td>
          <td colSpan={2}>
            <strong>Chassis No.:</strong> {vehicle.chassis_number}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// A printable approximation of Bethel's actual Policy Schedule document —
// shown to the agent before they submit, so what they see now is what the
// eventual policy document will look like.
export function PolicySchedulePreview({
  applicationNumber,
  isPreview,
  classNameLabel,
  variantName,
  insuredName,
  insuredAddress,
  agentCode,
  coverageStartAt,
  coverageEndAt,
  vehicles,
  coverages,
  totalPremium,
  docStamps,
  vat,
  lgt,
  misc,
  totalAmount,
  remarks,
}) {
  const from = fmtDateTime(coverageStartAt);
  const to = fmtDateTime(coverageEndAt);
  const hasVehicles = Array.isArray(vehicles) && vehicles.length > 0;
  const clausedCoverages = coverages.filter((c) => c.clause);

  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: 12, color: "#111" }}>
      <style>{`
        .policy-schedule-page { box-shadow: 0 1px 6px rgba(0,0,0,0.3); }
        @media print {
          .policy-schedule-page { box-shadow: none; margin: 0 !important; width: auto; min-height: 0; }
        }
      `}</style>
      <Page>
        {isPreview && (
          <div
            style={{
              textAlign: "center",
              color: "#b91c1c",
              fontWeight: 700,
              letterSpacing: 2,
              marginBottom: 12,
              fontFamily: "Arial, sans-serif",
            }}
          >
            PREVIEW — NOT YET ISSUED
          </div>
        )}

        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>POLICY SCHEDULE</div>
        <div style={{ textAlign: "center", fontWeight: 700, marginTop: 4, marginBottom: 16 }}>
          {classNameLabel?.toUpperCase()}
          {variantName ? ` — ${variantName.toUpperCase()}` : ""}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top", width: "55%", paddingRight: 16 }}>
                <div>
                  <strong>Policy No :</strong> {applicationNumber}
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong>Insured :</strong> {insuredName}
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong>Address :</strong> {insuredAddress || "—"}
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong>Agent Code:</strong> {agentCode || "—"}
                </div>
              </td>
              <td style={{ verticalAlign: "top", width: "45%" }}>
                <div style={{ marginBottom: 10 }}>
                  <strong>Date Issued:</strong> {fmtDate(new Date())}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td>Premium</td>
                      <td style={{ textAlign: "right" }}>{formatPHP(totalPremium)}</td>
                    </tr>
                    <tr>
                      <td>Doc. Stamps</td>
                      <td style={{ textAlign: "right" }}>{formatPHP(docStamps)}</td>
                    </tr>
                    <tr>
                      <td>V.A.T.</td>
                      <td style={{ textAlign: "right" }}>{formatPHP(vat)}</td>
                    </tr>
                    <tr>
                      <td>L.G.T.</td>
                      <td style={{ textAlign: "right" }}>{formatPHP(lgt)}</td>
                    </tr>
                    <tr>
                      <td>Miscellaneous</td>
                      <td style={{ textAlign: "right" }}>{formatPHP(misc)}</td>
                    </tr>
                    <tr style={{ borderTop: "1px solid #111" }}>
                      <td style={{ fontWeight: 700, paddingTop: 4 }}>Total Php.</td>
                      <td style={{ textAlign: "right", fontWeight: 700, paddingTop: 4 }}>
                        {formatPHP(totalAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #999" }}>
          <strong>Period of Insurance :</strong> {from.date} ({from.time}) &nbsp; To &nbsp; {to.date} ({to.time})
        </div>

        {hasVehicles && (
          <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #999" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              SCHEDULED VEHICLE{vehicles.length > 1 ? "S" : ""}
            </div>
            {vehicles.map((v, i) => (
              <div key={i} style={{ marginBottom: i < vehicles.length - 1 ? 10 : 0 }}>
                {vehicles.length > 1 && (
                  <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>Vehicle {i + 1}</div>
                )}
                <VehicleBlock vehicle={v} />
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #999" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>COVERAGES</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #111" }}>
                <td style={{ padding: "4px 0" }}>Coverage</td>
                <td style={{ padding: "4px 0", textAlign: "right" }}>Amount</td>
                <td style={{ padding: "4px 0", textAlign: "right" }}>Premium</td>
              </tr>
            </thead>
            <tbody>
              {coverages.map((c) => (
                <tr key={c.name}>
                  <td style={{ padding: "4px 0" }}>{c.name}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>{formatPHP(c.amount)}</td>
                  <td style={{ padding: "4px 0", textAlign: "right" }}>{formatPHP(c.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {remarks && (
          <div style={{ marginTop: 16, paddingTop: 8, borderTop: "1px solid #999" }}>
            <strong>Remarks:</strong> {remarks}
          </div>
        )}

        <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 10, maxWidth: 260 }}>
            Documentary Stamps to the value shown herein have been properly affixed and cancelled on the
            duplicate copy of the Policy.
          </div>
          <SignatureBlock />
        </div>
      </Page>

      {clausedCoverages.length > 0 && (
        <Page breakBefore>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
            Warranties and Clauses
          </div>
          <div style={{ fontSize: 11, marginBottom: 20 }}>
            ATTACH TO AND FORMING PART OF BETHEL GENERAL INSURANCE AND SURETY CORP. POLICY NO.:{" "}
            {applicationNumber}
          </div>
          {clausedCoverages.map((c) => (
            <div key={c.name} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.name.toUpperCase()} CLAUSE</div>
              <div style={{ textAlign: "justify" }}>{c.clause}</div>
            </div>
          ))}
          <div style={{ marginTop: 40, display: "flex", justifyContent: "flex-end" }}>
            <SignatureBlock />
          </div>
        </Page>
      )}
    </div>
  );
}
