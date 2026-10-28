import React, { useState, useRef, useEffect } from "react";

function App() {
  const [input, setInput] = useState("");
  const [entityResult, setEntityResult] = useState<any>(null);
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "summary" | "entities" | "triggers" | "timeline" | "event-table"
  >("summary");
  const [loading, setLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const words = input.trim() ? input.trim().split(/\s+/) : [];
  const wordCount = words.length;

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
  };

  const handleSendProcess = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setEntityResult(null);
    setTriggerResult(null);
    setFeedbackSent(false);
    setFeedback("");
    try {
      const [response1, response2] = await Promise.all([
        fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: input }),
        }),
        fetch("/api/process/event-trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: input }),
        }),
      ]);

      const data1 = await response1.json();
      const data2 = await response2.json();

      setEntityResult(data1);
      setTriggerResult(data2);
      setActiveTab("summary");
    } catch (error) {
      console.error(error);
      setEntityResult({
        error: "Cannot connect to the application server.",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- Export functions ---
  const buildExportData = () => {
    const eventTable = buildEventTableData();
    return {
      input_text: input,
      analyzed_at: new Date().toISOString(),
      entities: entityResult?.entities || [],
      triggers: triggerResult?.triggers || [],
      events: eventTable,
      summary: {
        total_entities: entityResult?.entities?.length || 0,
        total_triggers: triggerResult?.triggers?.length || 0,
        entity_types: getEntityTypeCounts(),
        event_types: getEventTypeCounts(),
      },
    };
  };

  const exportAsJSON = () => {
    const data = buildExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "nlp-result.json");
    setShowExportMenu(false);
  };

  const exportAsCSV = () => {
    // Export entities as CSV
    const entities = entityResult?.entities || [];
    const triggers = triggerResult?.triggers || [];

    let csv = "=== ENTITIES ===\n";
    csv += "Text,Label,Start,End\n";
    entities.forEach((ent: any) => {
      csv += `"${(ent.text || "").replace(/"/g, '""')}","${ent.label}",${ent.start},${ent.end}\n`;
    });

    csv += "\n=== EVENT TRIGGERS ===\n";
    csv += "Text,Event Type,Start,End\n";
    triggers.forEach((trg: any) => {
      csv += `"${(trg.text || "").replace(/"/g, '""')}","${trg.event_type}",${trg.start},${trg.end}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, "nlp-result.csv");
    setShowExportMenu(false);
  };

  const exportAsTXT = () => {
    const entities = entityResult?.entities || [];
    const triggers = triggerResult?.triggers || [];
    const eventTable = buildEventTableData();

    let txt = "╔══════════════════════════════════════════════════╗\n";
    txt += "║   NLP - Vietnamese Crimes Analysis Report        ║\n";
    txt += "╚══════════════════════════════════════════════════╝\n\n";
    txt += `📅 Thời gian: ${new Date().toLocaleString("vi-VN")}\n\n`;
    txt += `📝 VĂN BẢN ĐẦU VÀO:\n${input}\n\n`;
    txt += `━━━ THỐNG KÊ TỔNG QUAN ━━━\n`;
    txt += `• Số thực thể: ${entities.length}\n`;
    txt += `• Số trigger sự kiện: ${triggers.length}\n\n`;

    txt += `━━━ DANH SÁCH THỰC THỂ ━━━\n`;
    entities.forEach((ent: any, i: number) => {
      txt += `  ${i + 1}. [${ent.label}] "${ent.text}" (vị trí: ${ent.start}-${ent.end})\n`;
    });

    txt += `\n━━━ DANH SÁCH TRIGGER SỰ KIỆN ━━━\n`;
    triggers.forEach((trg: any, i: number) => {
      txt += `  ${i + 1}. [${trg.event_type}] "${trg.text}" (vị trí: ${trg.start}-${trg.end})\n`;
    });

    if (eventTable.length > 0) {
      txt += `\n━━━ BẢNG SỰ KIỆN ━━━\n`;
      eventTable.forEach((item: any, i: number) => {
        txt += `  ${i + 1}. Sự kiện: ${item.eventType} — Trigger: "${item.triggerText}"\n`;
        txt += `     Thực thể liên quan: ${item.entities.length > 0 ? item.entities.map((e: any) => `${e.text} (${e.label})`).join(", ") : "Không có"}\n`;
      });
    }

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, "nlp-result.txt");
    setShowExportMenu(false);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Helper: count entity types ---
  const getEntityTypeCounts = () => {
    const counts: Record<string, number> = {};
    (entityResult?.entities || []).forEach((ent: any) => {
      counts[ent.label] = (counts[ent.label] || 0) + 1;
    });
    return counts;
  };

  const getEventTypeCounts = () => {
    const counts: Record<string, number> = {};
    (triggerResult?.triggers || []).forEach((trg: any) => {
      counts[trg.event_type] = (counts[trg.event_type] || 0) + 1;
    });
    return counts;
  };

  // --- Entity label styling ---
  const labelColor: Record<string, { bg: string; text: string }> = {
    PERSON: { bg: "#3b82f6", text: "#fff" },
    LOCATION: { bg: "#22c55e", text: "#fff" },
    MONEY: { bg: "#eab308", text: "#000" },
    ORGANIZATION: { bg: "#ef4444", text: "#fff" },
    ORG: { bg: "#ef4444", text: "#fff" },
    TIME: { bg: "#06b6d4", text: "#000" },
    DRUG: { bg: "#8b5cf6", text: "#fff" },
  };
  const getLabelStyle = (label: string) =>
    labelColor[label] || { bg: "#6b7280", text: "#fff" };

  // Hàm highlight Entities
  const renderHighlightedEntities = (text: string, entities: any[]) => {
    if (!entities || entities.length === 0) return text;
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedEntities.forEach((ent, index) => {
      if (ent.start > lastIndex) {
        elements.push(text.substring(lastIndex, ent.start));
      }

      const style = getLabelStyle(ent.label);
      elements.push(
        <span
          key={index}
          style={{
            background: style.bg,
            color: style.text,
            padding: "2px 8px",
            borderRadius: "4px",
            margin: "0 2px",
            fontSize: "0.95rem",
            display: "inline",
            lineHeight: "2",
          }}
        >
          {text.substring(ent.start, ent.end)}
          <span
            style={{
              marginLeft: "4px",
              fontSize: "0.6rem",
              background: "rgba(255,255,255,0.25)",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            {ent.label}
          </span>
        </span>,
      );
      lastIndex = Math.max(lastIndex, ent.end);
    });
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }
    return elements;
  };

  // Hàm highlight Triggers
  const renderHighlightedTriggers = (text: string, triggers: any[]) => {
    if (!triggers || triggers.length === 0) return text;
    const sortedTriggers = [...triggers].sort((a, b) => a.start - b.start);
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedTriggers.forEach((trg, index) => {
      if (trg.start > lastIndex) {
        elements.push(text.substring(lastIndex, trg.start));
      }
      elements.push(
        <span
          key={index}
          style={{
            background: "#eab308",
            color: "#000",
            padding: "2px 8px",
            borderRadius: "4px",
            margin: "0 2px",
            fontSize: "0.95rem",
            display: "inline",
            lineHeight: "2",
          }}
        >
          {text.substring(trg.start, trg.end)}
          <span
            style={{
              marginLeft: "4px",
              fontSize: "0.6rem",
              background: "rgba(0,0,0,0.2)",
              padding: "1px 4px",
              borderRadius: "3px",
            }}
          >
            {trg.event_type}
          </span>
        </span>,
      );
      lastIndex = Math.max(lastIndex, trg.end);
    });
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }
    return elements;
  };

  // Trích xuất Timeline
  const extractTimelineEvents = (text: string, entities: any[]) => {
    if (!entities || !text) return [];
    return entities
      .filter((ent) => ent.label === "TIME")
      .map((ent) => {
        const snippetStart = Math.max(0, ent.start - 40);
        const snippetEnd = Math.min(text.length, ent.end + 120);
        let context = text.substring(snippetStart, snippetEnd).trim();
        if (snippetStart > 0) context = "..." + context;
        if (snippetEnd < text.length) context = context + "...";
        return { timeText: ent.text, start: ent.start, context };
      })
      .sort((a, b) => a.start - b.start);
  };

  // Xây dựng Bảng sự kiện (Kết hợp Triggers và các thực thể xung quanh trong bán kính 150 ký tự)
  const buildEventTableData = () => {
    if (!triggerResult?.triggers || !entityResult?.entities) return [];
    return triggerResult.triggers.map((trg: any) => {
      // Tìm các thực thể xuất hiện gần trigger này (trong khoảng ±150 ký tự)
      const associatedEntities = entityResult.entities.filter(
        (ent: any) => Math.abs(ent.start - trg.start) < 150,
      );
      return {
        triggerText: trg.text,
        eventType: trg.event_type,
        span: `${trg.start} - ${trg.end}`,
        entities: associatedEntities,
      };
    });
  };

  const hasResults = entityResult || triggerResult;
  const entityCount = entityResult?.entities?.length || 0;
  const triggerCount = triggerResult?.triggers?.length || 0;
  const entityTypeCounts = getEntityTypeCounts();
  const eventTypeCounts = getEventTypeCounts();

  return (
    <div
      className="min-vh-100 vw-100 d-flex flex-column align-items-center py-5 overflow-auto"
      style={{ background: "rgba(19, 16, 40, 0.94)" }}
    >
      <div
        className="d-flex flex-column align-items-center p-4"
        style={{
          width: "90%",
          maxWidth: "900px",
          background: "rgba(19, 16, 40, 0.94)",
          border: "solid 4px rgba(5, 20, 55, 0.94)",
          boxShadow:
            "rgba(0, 0, 0, 0.25) 0 10px 15px -3px, rgba(0, 0, 0, 0.1) 0 4px 6px -2px",
          borderRadius: "12px",
        }}
      >
        <h3 className="text-white mb-4">
          ⚖️ NLP - Vietnamese Crimes Analysis
        </h3>

        <div className="w-100 mb-4">
          <div className="d-flex justify-content-between align-items-center mb-1 px-1">
            <span className="text-muted small">Input text content</span>
            <span className="small fw-bold text-info">{wordCount} words</span>
          </div>

          <div className="input-group d-flex justify-content-between align-items-center">
            <textarea
              rows={4}
              className="form-control rounded-0"
              placeholder="Enter crime news or article text..."
              value={input}
              onChange={handleChange}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                (e.ctrlKey || e.metaKey) &&
                handleSendProcess()
              }
            />
            <button
              className={`btn ${input.trim() && !loading ? "btn-primary" : "disabled btn-secondary"} rounded-0`}
              type="button"
              onClick={handleSendProcess}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-1"
                    role="status"
                  />
                  Processing...
                </>
              ) : (
                "🔍 Process"
              )}
            </button>
            <button className="btn btn-info rounded-0" type="button">
              📎 Add file
            </button>
          </div>
        </div>

        {/* ====== RESULT AREA ====== */}
        {hasResults && (
          <div className="w-100 mt-2 p-3 bg-dark border border-secondary rounded text-start text-white">
            {/* Header: title + tabs + export */}
            <div className="d-flex flex-wrap justify-content-between align-items-center border-bottom pb-2 mb-3 gap-2">
              <h6 className="text-info m-0">📊 Analysis Result</h6>

              <div className="d-flex align-items-center gap-2 flex-wrap">
                {/* Tabs */}
                <div
                  className="btn-group btn-group-sm flex-wrap"
                  role="group"
                >
                  <button
                    type="button"
                    className={`btn ${activeTab === "summary" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setActiveTab("summary")}
                  >
                    📋 Summary
                  </button>
                  <button
                    type="button"
                    className={`btn ${activeTab === "entities" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setActiveTab("entities")}
                  >
                    🏷️ Entities
                  </button>
                  <button
                    type="button"
                    className={`btn ${activeTab === "triggers" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setActiveTab("triggers")}
                  >
                    ⚡ Triggers
                  </button>
                  <button
                    type="button"
                    className={`btn ${activeTab === "timeline" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setActiveTab("timeline")}
                  >
                    🕐 Timeline
                  </button>
                  <button
                    type="button"
                    className={`btn ${activeTab === "event-table" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setActiveTab("event-table")}
                  >
                    📑 Events
                  </button>
                </div>

                {/* Export dropdown */}
                <div className="position-relative" ref={exportRef}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success"
                    onClick={() => setShowExportMenu(!showExportMenu)}
                  >
                    💾 Export ▾
                  </button>
                  {showExportMenu && (
                    <div
                      className="position-absolute bg-dark border border-secondary rounded shadow-lg"
                      style={{
                        right: 0,
                        top: "100%",
                        zIndex: 1000,
                        minWidth: "180px",
                        marginTop: "4px",
                      }}
                    >
                      <button
                        className="dropdown-item text-white px-3 py-2 d-flex align-items-center gap-2 w-100 border-0 bg-transparent"
                        style={{ cursor: "pointer" }}
                        onClick={exportAsJSON}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#374151")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <span>📄</span> Export as JSON
                      </button>
                      <button
                        className="dropdown-item text-white px-3 py-2 d-flex align-items-center gap-2 w-100 border-0 bg-transparent"
                        style={{ cursor: "pointer" }}
                        onClick={exportAsCSV}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#374151")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <span>📊</span> Export as CSV
                      </button>
                      <button
                        className="dropdown-item text-white px-3 py-2 d-flex align-items-center gap-2 w-100 border-0 bg-transparent"
                        style={{ cursor: "pointer" }}
                        onClick={exportAsTXT}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#374151")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <span>📝</span> Export as TXT
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ====== Tab: Summary (NEW) ====== */}
            {activeTab === "summary" && (
              <div>
                {entityResult?.error ? (
                  <div className="alert alert-danger d-flex align-items-center gap-2">
                    <span>❌</span> {entityResult.error}
                  </div>
                ) : (
                  <>
                    {/* Stats cards */}
                    <div className="row g-3 mb-4">
                      <div className="col-6 col-md-3">
                        <div
                          className="p-3 rounded text-center"
                          style={{ background: "#1e293b", border: "1px solid #334155" }}
                        >
                          <div
                            className="fw-bold"
                            style={{ fontSize: "1.8rem", color: "#3b82f6" }}
                          >
                            {entityCount}
                          </div>
                          <div className="text-muted small">Entities</div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div
                          className="p-3 rounded text-center"
                          style={{ background: "#1e293b", border: "1px solid #334155" }}
                        >
                          <div
                            className="fw-bold"
                            style={{ fontSize: "1.8rem", color: "#eab308" }}
                          >
                            {triggerCount}
                          </div>
                          <div className="text-muted small">Triggers</div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div
                          className="p-3 rounded text-center"
                          style={{ background: "#1e293b", border: "1px solid #334155" }}
                        >
                          <div
                            className="fw-bold"
                            style={{ fontSize: "1.8rem", color: "#22c55e" }}
                          >
                            {Object.keys(entityTypeCounts).length}
                          </div>
                          <div className="text-muted small">Entity Types</div>
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div
                          className="p-3 rounded text-center"
                          style={{ background: "#1e293b", border: "1px solid #334155" }}
                        >
                          <div
                            className="fw-bold"
                            style={{ fontSize: "1.8rem", color: "#a855f7" }}
                          >
                            {Object.keys(eventTypeCounts).length}
                          </div>
                          <div className="text-muted small">Event Types</div>
                        </div>
                      </div>
                    </div>

                    {/* Entity type breakdown */}
                    {Object.keys(entityTypeCounts).length > 0 && (
                      <div className="mb-3">
                        <strong className="text-light d-block mb-2">
                          🏷️ Entity Breakdown:
                        </strong>
                        <div className="d-flex flex-wrap gap-2">
                          {Object.entries(entityTypeCounts).map(
                            ([label, count]) => {
                              const style = getLabelStyle(label);
                              return (
                                <span
                                  key={label}
                                  className="badge px-3 py-2"
                                  style={{
                                    background: style.bg,
                                    color: style.text,
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {label}: {count as number}
                                </span>
                              );
                            },
                          )}
                        </div>
                      </div>
                    )}

                    {/* Event type breakdown */}
                    {Object.keys(eventTypeCounts).length > 0 && (
                      <div className="mb-3">
                        <strong className="text-light d-block mb-2">
                          ⚡ Event Type Breakdown:
                        </strong>
                        <div className="d-flex flex-wrap gap-2">
                          {Object.entries(eventTypeCounts).map(
                            ([evType, count]) => (
                              <span
                                key={evType}
                                className="badge px-3 py-2"
                                style={{
                                  background: "#eab308",
                                  color: "#000",
                                  fontSize: "0.85rem",
                                }}
                              >
                                {evType}: {count as number}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {/* Highlighted preview */}
                    <div className="mb-3 p-3 bg-black rounded border border-secondary">
                      <strong className="text-light d-block mb-2">
                        📌 Highlighted Preview:
                      </strong>
                      <div className="fs-6 lh-lg">
                        {renderHighlightedEntities(
                          entityResult?.input_text || input,
                          entityResult?.entities || [],
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tab: Entities */}
            {activeTab === "entities" && (
              <div>
                {entityResult?.error ? (
                  <div className="text-danger">{entityResult.error}</div>
                ) : entityResult ? (
                  <div>
                    <p className="mb-2 text-light small">
                      Status:{" "}
                      <span className="text-success">
                        {entityResult.status}
                      </span>{" "}
                      | Message: {entityResult.message}
                    </p>
                    <div className="mb-3 p-3 bg-black rounded border border-secondary">
                      <strong className="text-light d-block mb-2">
                        Highlighted Entities:
                      </strong>
                      <div className="fs-6 lh-lg">
                        {renderHighlightedEntities(
                          entityResult.input_text,
                          entityResult.entities,
                        )}
                      </div>
                    </div>
                    {entityResult.entities?.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-dark table-striped table-bordered table-sm mb-0">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Text</th>
                              <th>Label</th>
                              <th>Span</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entityResult.entities.map(
                              (ent: any, idx: number) => {
                                const style = getLabelStyle(ent.label);
                                return (
                                  <tr key={idx}>
                                    <td className="text-muted">{idx + 1}</td>
                                    <td>
                                      <code>{ent.text}</code>
                                    </td>
                                    <td>
                                      <span
                                        className="badge"
                                        style={{
                                          background: style.bg,
                                          color: style.text,
                                        }}
                                      >
                                        {ent.label}
                                      </span>
                                    </td>
                                    <td>
                                      {ent.start} – {ent.end}
                                    </td>
                                  </tr>
                                );
                              },
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Tab: Triggers */}
            {activeTab === "triggers" && (
              <div>
                {triggerResult ? (
                  <div>
                    <div className="mb-3 p-3 bg-black rounded border border-secondary">
                      <strong className="text-light d-block mb-2">
                        Highlighted Event Triggers:
                      </strong>
                      <div className="fs-6 lh-lg">
                        {renderHighlightedTriggers(
                          triggerResult.input_text,
                          triggerResult.triggers,
                        )}
                      </div>
                    </div>
                    {triggerResult.triggers?.length > 0 && (
                      <div className="table-responsive">
                        <table className="table table-dark table-striped table-bordered table-sm mb-0">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Text</th>
                              <th>Event Type</th>
                              <th>Span</th>
                            </tr>
                          </thead>
                          <tbody>
                            {triggerResult.triggers.map(
                              (trg: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="text-muted">{idx + 1}</td>
                                  <td>
                                    <code>{trg.text}</code>
                                  </td>
                                  <td>
                                    <span className="badge bg-warning text-dark">
                                      {trg.event_type}
                                    </span>
                                  </td>
                                  <td>
                                    {trg.start} – {trg.end}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted">No data.</div>
                )}
              </div>
            )}

            {/* Tab: Timeline */}
            {activeTab === "timeline" && (
              <div>
                <strong className="text-light d-block mb-3">
                  🕐 Chronological Event Timeline:
                </strong>
                {entityResult?.entities ? (
                  (() => {
                    const events = extractTimelineEvents(
                      entityResult.input_text,
                      entityResult.entities,
                    );
                    if (events.length === 0)
                      return (
                        <div className="text-muted">
                          No time entities found.
                        </div>
                      );
                    return (
                      <div className="position-relative ps-4 border-start border-info border-2 my-2">
                        {events.map((ev, idx) => (
                          <div key={idx} className="mb-4 position-relative">
                            <span
                              className="position-absolute bg-info rounded-circle"
                              style={{
                                width: "12px",
                                height: "12px",
                                left: "-31px",
                                top: "4px",
                              }}
                            />
                            <div className="bg-black p-3 rounded border border-secondary">
                              <span className="badge bg-info text-dark fs-6 mb-2">
                                📅 {ev.timeText}
                              </span>
                              <div className="text-light small lh-base">
                                {ev.context}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-muted">No data.</div>
                )}
              </div>
            )}

            {/* Tab: Event Table */}
            {activeTab === "event-table" && (
              <div>
                <strong className="text-light d-block mb-3">
                  📑 Structured Event Table (Triggers & Associated Entities):
                </strong>
                {triggerResult?.triggers ? (
                  <div className="table-responsive">
                    <table className="table table-dark table-striped table-bordered table-sm mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Event Type (Trigger)</th>
                          <th>Trigger Span</th>
                          <th>Involved Entities</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildEventTableData().map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td className="text-muted">{idx + 1}</td>
                            <td>
                              <span className="badge bg-warning text-dark">
                                {item.eventType}
                              </span>
                              <div className="small mt-1">
                                <code>{item.triggerText}</code>
                              </div>
                            </td>
                            <td>{item.span}</td>
                            <td>
                              {item.entities.length > 0 ? (
                                <div className="d-flex flex-wrap gap-1">
                                  {item.entities.map((e: any, eIdx: number) => {
                                    const s = getLabelStyle(e.label);
                                    return (
                                      <span
                                        key={eIdx}
                                        className="badge"
                                        style={{
                                          background: s.bg,
                                          color: s.text,
                                        }}
                                      >
                                        {e.text}{" "}
                                        <small style={{ opacity: 0.8 }}>
                                          ({e.label})
                                        </small>
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted small">
                                  No close entities
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-muted">No trigger data available.</div>
                )}
              </div>
            )}

            {/* ====== Feedback Section ====== */}
            <div className="mt-4 pt-3 border-top border-secondary">
              <strong className="text-light d-block mb-2">
                💬 Phản hồi kết quả:
              </strong>
              {feedbackSent ? (
                <div className="alert alert-success d-flex align-items-center gap-2 py-2">
                  <span>✅</span> Cảm ơn bạn đã gửi phản hồi!
                </div>
              ) : (
                <div className="d-flex gap-2">
                  <input
                    type="text"
                    className="form-control form-control-sm bg-black text-white border-secondary"
                    placeholder="Nhận xét về kết quả phân tích (vd: chính xác, thiếu entity...)"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && feedback.trim()) {
                        console.log("User feedback:", feedback, {
                          entities: entityResult?.entities,
                          triggers: triggerResult?.triggers,
                          input_text: input,
                        });
                        setFeedbackSent(true);
                      }
                    }}
                  />
                  <button
                    className="btn btn-sm btn-outline-info"
                    disabled={!feedback.trim()}
                    onClick={() => {
                      console.log("User feedback:", feedback, {
                        entities: entityResult?.entities,
                        triggers: triggerResult?.triggers,
                        input_text: input,
                      });
                      setFeedbackSent(true);
                    }}
                  >
                    Gửi
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
