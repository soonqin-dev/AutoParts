"use client";

import { useEffect, useState } from "react";
import { MAX_QUANTITY, MAX_UNIT_PRICE, formatMoney, lineCents, moneyToCents,
  newQuotationDetails, quotationTotals } from "./quotation-utils";
import { canShareFile, downloadFile } from "./share";
import { DEFAULT_COMPANY, DETAILS_KEY, readStoredJson, validDetails } from "./storage";
import { imageToWebP } from "./images";

export default function Quotation({ items, setItems, ready, error, onBack }) {
  const [details, setDetails] = useState(newQuotationDetails);
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [metadataReady, setMetadataReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [edits, setEdits] = useState({});
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pdf, setPdf] = useState(null);

  useEffect(() => {
    try {
      const saved = readStoredJson(DETAILS_KEY, validDetails, null);
      if (saved) {
        setDetails(saved.details);
        setCompany(saved.company);
      }
      setMetadataReady(true);
    } catch (err) {
      setStorageError(`无法读取报价资料：${err.message || "请检查浏览器存储后刷新重试。原资料未被覆盖。"}`);
    }
  }, []);

  useEffect(() => {
    if (!metadataReady) return;
    try {
      localStorage.setItem(DETAILS_KEY, JSON.stringify({ details, company }));
      setStorageError("");
    } catch {
      setStorageError("报价资料未能保存，刷新后可能丢失。请检查浏览器存储空间。");
    }
  }, [details, company, metadataReady]);

  const totals = quotationTotals(items, details.discount);
  const invalidRows = items.some(item => {
    const draft = edits[item.product.id];
    return lineCents(item) === null || (draft && (
      !/^\d+$/.test(draft.quantity) || Number(draft.quantity) < 1 ||
      Number(draft.quantity) > MAX_QUANTITY || moneyToCents(draft.unitPrice) === null ||
      Number(draft.unitPrice) > MAX_UNIT_PRICE
    ));
  });
  const fingerprint = JSON.stringify({ items, details, company, edits });
  const currentPdf = pdf?.fingerprint === fingerprint ? pdf.file : null;
  const locked = generating || sharing || logoLoading || !ready || !metadataReady;

  function updateLine(item, field, value) {
    const draft = { quantity: String(item.quantity), unitPrice: String(item.unitPrice),
      ...edits[item.product.id], [field]: value };
    setEdits(prev => ({ ...prev, [item.product.id]: draft }));
    setMessage("");
    if (!/^\d+$/.test(draft.quantity) || Number(draft.quantity) < 1 ||
        Number(draft.quantity) > MAX_QUANTITY || moneyToCents(draft.unitPrice) === null ||
        Number(draft.unitPrice) > MAX_UNIT_PRICE) return;
    const next = { ...item, quantity: Number(draft.quantity), unitPrice: Number(draft.unitPrice) };
    next.lineTotal = lineCents(next) / 100;
    setItems(prev => prev.map(line => line.product.id === item.product.id ? next : line));
  }

  function updateDetails(key, value) {
    setDetails(prev => ({ ...prev, [key]: value }));
    setMessage("");
  }

  function removeItem(id) {
    setItems(prev => prev.filter(item => item.product.id !== id));
    setEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMessage("");
  }

  function startNewQuotation() {
    if (!window.confirm("新建报价将清空当前产品和客户资料，已下载的 PDF 不受影响。继续吗？")) return;
    setItems([]);
    setDetails(newQuotationDetails());
    setEdits({});
    setPdf(null);
    setMessage("");
  }

  async function uploadLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 1024 * 1024) {
      setMessage("公司 Logo 请使用小于 1MB 的 PNG、JPG 或 WebP 图片。");
      return;
    }
    setLogoLoading(true);
    try {
      const dataUrl = await imageToWebP(file);
      setCompany(prev => ({ ...prev, logo: dataUrl }));
      setMessage("");
    } catch (err) {
      setMessage(err.message || "无法读取 Logo，请选择有效的图片文件。");
    } finally {
      setLogoLoading(false);
    }
  }

  async function generatePdf(event) {
    event.preventDefault();
    if (locked || !items.length || invalidRows || totals.total === null) return;
    if (!details.customerName.trim() || !company.name.trim() || !details.date || !details.number.trim()) {
      setMessage("请填写客户名称、公司名称和报价日期。");
      return;
    }
    setGenerating(true);
    setPdf(null);
    setMessage("");
    try {
      const { createQuotationPdf } = await import("./quotation-pdf");
      const file = await createQuotationPdf({ items, details, company });
      setPdf({ file, fingerprint });
      setMessage("报价 PDF 已生成，可以下载或分享给客户。");
    } catch (err) {
      setMessage(err.message || "PDF 生成失败，请重试。");
    } finally {
      setGenerating(false);
    }
  }

  async function sharePdf() {
    if (!currentPdf || sharing) return;
    if (!canShareFile(currentPdf)) {
      setMessage("此浏览器无法直接分享 PDF。请下载后在 WhatsApp 中选择附件 → 文档发送。");
      return;
    }
    setSharing(true);
    setMessage("");
    try {
      // The file is prepared beforehand so this call retains the tap's user activation.
      await navigator.share({ files: [currentPdf], title: `Quotation ${details.number}` });
      setMessage("已完成分享操作。");
    } catch (err) {
      if (err.name !== "AbortError") setMessage("未能分享 PDF。请下载文件后在 WhatsApp 中发送。");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="page quotationPage">
      <div className="quotationNavigation">
        <button type="button" className="cancelButton" onClick={onBack} disabled={generating || sharing || logoLoading}>
          ← 返回产品目录
        </button>
        <button type="button" className="textButton" onClick={startNewQuotation} disabled={locked}>
          新建报价
        </button>
      </div>
      <header className="quotationHeading">
        <div className="eyebrow">SALESGO · QUOTATION</div>
        <h1>报价清单</h1>
        <p>编辑产品，填写客户资料，生成报价 PDF。</p>
      </header>
      {error && <p className="quotationError" role="alert">{error}</p>}
      {storageError && <p className="quotationError" role="alert">{storageError}</p>}

      <form onSubmit={generatePdf}>
        <fieldset className="quotationFields" disabled={locked}>
          <section className="quotationSection" aria-labelledby="quotationItemsTitle">
            <h2 id="quotationItemsTitle">产品 <span>{items.length} 项</span></h2>
            {!items.length ? (
              <div className="empty">
                <p>报价清单还没有产品。</p>
                <button type="button" className="saveButton" onClick={onBack}>返回目录选择产品</button>
              </div>
            ) : items.map(item => {
              const draft = edits[item.product.id];
              const quantity = draft?.quantity ?? String(item.quantity);
              const unitPrice = draft?.unitPrice ?? String(item.unitPrice);
              const quantityInvalid = !/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_QUANTITY;
              const priceInvalid = moneyToCents(unitPrice) === null || Number(unitPrice) > MAX_UNIT_PRICE;
              return (
                <article className="quotationItem" key={item.product.id}>
                  <div className="quotationItemHeading">
                    <div><h3>{item.product.name}</h3><p>{item.product.serial}</p></div>
                    <button type="button" className="deleteButton" aria-label={`移除 ${item.product.name}`}
                      onClick={() => removeItem(item.product.id)}>移除</button>
                  </div>
                  <div className="quotationItemInputs">
                    <label>数量
                      <input type="number" min="1" max={MAX_QUANTITY} step="1" required
                        aria-label={`${item.product.serial} 数量`} aria-invalid={quantityInvalid}
                        inputMode="numeric" value={quantity} onChange={e => updateLine(item, "quantity", e.target.value)} />
                    </label>
                    <label>单价（RM）
                      <input type="number" min="0" max={MAX_UNIT_PRICE} step="0.01" required
                        aria-label={`${item.product.serial} 单价`} aria-invalid={priceInvalid}
                        inputMode="decimal" value={unitPrice} onChange={e => updateLine(item, "unitPrice", e.target.value)} />
                    </label>
                  </div>
                  {(quantityInvalid || priceInvalid) && <p className="quotationError">数量须为正整数，单价须为非负金额，最多两位小数。</p>}
                  <div className="lineTotal">行金额 <strong>{quantityInvalid || priceInvalid ? "—" : formatMoney(lineCents(item))}</strong></div>
                </article>
              );
            })}
          </section>

          <section className="quotationSection" aria-labelledby="quotationCustomerTitle">
            <h2 id="quotationCustomerTitle">客户资料</h2>
            <label>客户名称 *
              <input value={details.customerName} required maxLength={120} autoComplete="name"
                onChange={e => updateDetails("customerName", e.target.value)} placeholder="客户或公司名称" />
            </label>
            <label>客户电话
              <input type="tel" value={details.phone} maxLength={40} autoComplete="tel"
                onChange={e => updateDetails("phone", e.target.value)} placeholder="例如 +60 12 345 6789" />
            </label>
          </section>

          <section className="quotationSection" aria-labelledby="quotationInfoTitle">
            <h2 id="quotationInfoTitle">报价资料</h2>
            <label>报价编号<input value={details.number} readOnly /></label>
            <label>日期 *<input type="date" value={details.date} required
              onChange={e => updateDetails("date", e.target.value)} /></label>
            <label>备注<textarea value={details.notes} maxLength={3000} rows={3}
              onChange={e => updateDetails("notes", e.target.value)} placeholder="例如报价有效期、交货说明" /></label>
            <label>折扣（RM）<input type="number" min="0" step="0.01" inputMode="decimal"
              value={details.discount} aria-invalid={totals.total === null}
              onChange={e => updateDetails("discount", e.target.value)} /></label>
            {totals.total === null && !invalidRows && <p className="quotationError">折扣须为非负金额，最多两位小数，且不能超过小计。</p>}
            <dl className="quotationTotals">
              <div><dt>小计</dt><dd>{invalidRows ? "—" : formatMoney(totals.subtotal)}</dd></div>
              <div><dt>折扣</dt><dd>{formatMoney(totals.discount)}</dd></div>
              <div className="grandTotal"><dt>总额</dt><dd>{invalidRows ? "—" : formatMoney(totals.total)}</dd></div>
            </dl>
          </section>

          <details className="quotationSection companySettings">
            <summary>公司资料（用于报价与产品卡片）</summary>
            <label>公司名称 *<input value={company.name} required maxLength={120}
              onInvalid={e => { e.currentTarget.closest("details").open = true; }}
              onChange={e => setCompany(prev => ({ ...prev, name: e.target.value }))} /></label>
            <label>公司电话 / 联系方式<input value={company.contact} maxLength={180}
              onChange={e => setCompany(prev => ({ ...prev, contact: e.target.value }))} placeholder="电话、Email 或地址" /></label>
            <label>公司 Logo<input type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                uploadLogo(file);
              }} /><small>PNG、JPG 或 WebP，小于 1MB，自动转换为 WebP。</small></label>
            {company.logo && <div className="companyLogoPreview">
              <img src={company.logo} alt="公司 Logo" />
              <button type="button" className="textButton" onClick={() => setCompany(prev => ({ ...prev, logo: "" }))}>移除 Logo</button>
            </div>}
          </details>
        </fieldset>

        <button type="submit" className="generatePdfButton saveButton"
          disabled={locked || !items.length || invalidRows || totals.total === null}>
          {generating ? "正在生成 PDF…" : "生成报价 PDF"}
        </button>
      </form>
      {currentPdf && <div className="pdfActions">
        <button type="button" className="cancelButton" disabled={sharing} onClick={() => downloadFile(currentPdf)}>下载 PDF</button>
        <button type="button" className="whatsappButton" disabled={sharing} onClick={sharePdf}>
          {sharing ? "正在打开分享…" : "分享 PDF"}
        </button>
      </div>}
      <p className="quotationMessage" role="status" aria-live="polite">{message}</p>
    </main>
  );
}
