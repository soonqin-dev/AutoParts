"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Quotation from "./Quotation";
import { MAX_QUANTITY, MAX_UNIT_PRICE, lineCents, moneyToCents } from "./quotation-utils";
import { canShareFile, downloadFile } from "./share";
import { imageToWebP } from "./images";
import { createProductCard } from "./product-card";
import { CATALOG_KEY, QUOTATION_KEY, DETAILS_KEY, DEFAULT_COMPANY,
  readStoredJson, validCatalog, validQuotation, validDetails } from "./storage";

const samples = [
  {
    id: "sample-1",
    serial: "P-001",
    name: "Sample Product A",
    tags: ["Sample", "Category A"],
    price: "85.00",
    image: ""
  },
  {
    id: "sample-2",
    serial: "P-002",
    name: "Sample Product B",
    tags: ["Sample", "Category B"],
    price: "35.00",
    image: ""
  }
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const imageUploadToken = useRef(0);
  const [formError, setFormError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [ready, setReady] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quotationItems, setQuotationItems] = useState([]);
  const [quotationReady, setQuotationReady] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [detailMessage, setDetailMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareCompany, setShareCompany] = useState(DEFAULT_COMPANY);
  const [companyReady, setCompanyReady] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const [productCard, setProductCard] = useState(null);
  const [cardGenerating, setCardGenerating] = useState(false);
  const [cardAttempt, setCardAttempt] = useState(0);
  const [quotationOpen, setQuotationOpen] = useState(false);
  const detailDialog = useRef(null);

  const [serial, setSerial] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");

  useEffect(() => {
    try {
      setItems(readStoredJson(CATALOG_KEY, validCatalog, samples));
      setReady(true);
    } catch (err) {
      setCatalogError(`无法读取产品资料：${err.message || "请检查浏览器存储后刷新重试。"}`);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify(items));
      setCatalogError("");
    } catch {
      setCatalogError("产品资料未能保存，刷新后可能丢失。请检查浏览器存储空间。");
    }
  }, [items, ready]);

  useEffect(() => {
    try {
      setQuotationItems(readStoredJson(QUOTATION_KEY, validQuotation, []));
      setQuotationReady(true);
    } catch (err) {
      // Preserve the saved draft if it cannot be read.
      setQuotationError(`无法读取报价清单：${err.message || "请检查浏览器存储后刷新重试。"}`);
    }
  }, []);

  useEffect(() => {
    if (!quotationReady) return;
    try {
      localStorage.setItem(QUOTATION_KEY, JSON.stringify(quotationItems));
      setQuotationError("");
    } catch {
      setQuotationError("报价清单未能保存到浏览器，刷新后可能丢失。请检查存储空间。");
    }
  }, [quotationItems, quotationReady]);

  function refreshCompany() {
    try {
      const saved = readStoredJson(DETAILS_KEY, validDetails, null);
      setShareCompany(saved?.company || DEFAULT_COMPANY);
      setCompanyReady(true);
      setCompanyError("");
    } catch (err) {
      setCompanyReady(false);
      setCompanyError(`无法读取公司资料：${err.message || "请检查浏览器存储后刷新重试。"}`);
    }
  }

  useEffect(() => { refreshCompany(); }, []);

  useEffect(() => {
    if (!selectedProduct || !companyReady) return;
    let cancelled = false;
    setCardGenerating(true);
    setProductCard(null);
    createProductCard(selectedProduct, shareCompany)
      .then(file => { if (!cancelled) setProductCard(file); })
      .catch(err => { if (!cancelled) setDetailMessage(`产品卡片生成失败：${err.message || "请重试。"}`); })
      .finally(() => { if (!cancelled) setCardGenerating(false); });
    return () => { cancelled = true; };
  }, [selectedProduct, shareCompany, companyReady, cardAttempt]);

  useEffect(() => {
    if (!selectedProduct) return;
    const dialog = detailDialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedProduct]);

  const quotationCount = quotationItems.reduce((sum, item) => sum + item.quantity, 0);

  function openProductDetail(item) {
    setDetailMessage("");
    setProductCard(null);
    refreshCompany();
    setSelectedProduct(item);
  }

  async function shareProductCard() {
    if (!productCard || sharing) return;
    setDetailMessage("");
    if (!canShareFile(productCard)) {
      setDetailMessage("此浏览器无法直接分享卡片。请下载产品卡片，再在 WhatsApp 中选择这张图片发送。");
      return;
    }
    setSharing(true);
    try {
      // The prepared JPG contains all product details, with no separate caption to lose.
      await navigator.share({ files: [productCard] });
    } catch (err) {
      if (err.name !== "AbortError") setDetailMessage("卡片分享未完成。请下载产品卡片后在 WhatsApp 中发送。");
    } finally {
      setSharing(false);
    }
  }

  function viewQuotation() {
    setSelectedProduct(null);
    setQuotationOpen(true);
  }

  function addToQuotation(item) {
    const unitPrice = Number(item.price);
    if (moneyToCents(item.price) === null || unitPrice > MAX_UNIT_PRICE) {
      setDetailMessage("产品价格无效，无法加入报价清单。");
      return;
    }

    if (quotationItems.some(line => line.product.id === item.id && line.quantity >= MAX_QUANTITY)) {
      setDetailMessage("此产品的数量已达到上限，请到报价清单调整。");
      return;
    }

    setQuotationItems((prev) => {
      const existing = prev.find((line) => line.product.id === item.id);
      if (existing) {
        return prev.map((line) => line.product.id === item.id
          ? {
              ...line,
              quantity: line.quantity + 1,
              lineTotal: lineCents({ ...line, quantity: line.quantity + 1 }) / 100
            }
          : line);
      }
      return [...prev, {
        // Keep a small snapshot so catalog deletion does not change the draft.
        product: { id: item.id, serial: item.serial, name: item.name },
        quantity: 1,
        unitPrice,
        lineTotal: moneyToCents(item.price) / 100
      }];
    });
    setDetailMessage(`已加入报价清单（共 ${quotationCount + 1} 件）。`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [item.serial, item.name, ...(item.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  function resetForm() {
    imageUploadToken.current += 1;
    setImageLoading(false);
    setFormError("");
    setEditingId(null);
    setSerial("");
    setName("");
    setTags("");
    setPrice("");
    setImage("");
  }

  function editItem(item) {
    resetForm();
    setEditingId(item.id);
    setSerial(item.serial);
    setName(item.name);
    setTags((item.tags || []).join(", "));
    setPrice(String(item.price));
    setImage(item.image || "");
    setOpen(true);
  }

  function closeForm() {
    resetForm();
    setOpen(false);
  }

  function addItem(e) {
    e.preventDefault();
    if (imageLoading || !serial.trim() || !name.trim() || !price.trim()) return;

    const priceCents = moneyToCents(price.trim().replace(/^\./, "0."));
    if (priceCents === null || priceCents / 100 > MAX_UNIT_PRICE) {
      setFormError("请输入有效的非负价格，最多两位小数，且不超过 RM 9,999,999.99。");
      return;
    }

    const newItem = {
      id: editingId || makeId(),
      serial: serial.trim(),
      name: name.trim(),
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      price: (priceCents / 100).toFixed(2),
      image
    };

    setItems((prev) => editingId
      ? prev.map(item => item.id === editingId ? { ...item, ...newItem } : item)
      : [newItem, ...prev]);
    closeForm();
  }

  function deleteItem(id) {
    if (!window.confirm("确定删除这个产品吗？")) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  async function onImageChange(file) {
    if (!file) return;
    const token = ++imageUploadToken.current;
    setImageLoading(true);
    setFormError("");
    try {
      const converted = await imageToWebP(file);
      if (imageUploadToken.current === token) setImage(converted);
    } catch (err) {
      if (imageUploadToken.current === token) setFormError(err.message || "图片转换失败，请重试。");
    } finally {
      if (imageUploadToken.current === token) setImageLoading(false);
    }
  }

  if (quotationOpen) {
    return <Quotation items={quotationItems} setItems={setQuotationItems}
      ready={quotationReady} error={quotationError} onBack={() => {
        refreshCompany();
        setQuotationOpen(false);
      }} />;
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">SALES TOOL</div>
          <h1>SalesGo</h1>
          <p>Mobile Sales Catalog &amp; Quotation Tool</p>
          <p>移动产品目录与报价工具</p>
        </div>
        <div className="badge">{items.length} 项产品</div>
      </section>

      <div className="notice">
        产品和报价保存在这台设备的浏览器中。
      </div>

      <div className="quotationSummary" role="status" aria-live="polite">
        <button type="button" className="quotationCartButton" disabled={!quotationReady} onClick={viewQuotation}>
          <span>报价清单：<strong>{quotationCount} 件</strong></span>
          <span>查看 / 生成报价 →</span>
        </button>
      </div>
      {quotationError && <p className="quotationError" role="alert">{quotationError}</p>}
      {catalogError && <p className="quotationError" role="alert">{catalogError}</p>}
      {companyError && <p className="quotationError" role="alert">{companyError}</p>}

      <div className="searchWrap">
        <span className="searchIcon">⌕</span>
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索产品编号、名称、标签..."
          aria-label="搜索产品"
        />
        {query && (
          <button className="clear" onClick={() => setQuery("")}>
            清除
          </button>
        )}
      </div>

      <button className="addButton" disabled={!ready} onClick={() => { resetForm(); setOpen(true); }}>
        ＋ 新增产品
      </button>

      <section className="list">
        {filtered.length === 0 ? (
          <div className="empty">{ready ? "没有找到符合的产品。" : catalogError ? "产品资料暂时无法读取。" : "正在读取产品资料…"}</div>
        ) : (
          filtered.map((item) => (
            <article className="card" key={item.id} onClick={() => openProductDetail(item)}>
              <div className="thumb">
                {item.image ? (
                  <img src={item.image} alt={item.name} />
                ) : (
                  <div className="placeholder">NO PHOTO</div>
                )}
              </div>

              <div className="content">
                <div className="topline">
                  <button
                    type="button"
                    className="name productNameButton"
                    aria-label={`查看 ${item.name} 详情`}
                    aria-haspopup="dialog"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProductDetail(item);
                    }}
                  >
                    {item.name}
                  </button>
                  <div className="price">RM {item.price}</div>
                </div>

                <div className="serial">产品编号：{item.serial}</div>

                {!!item.tags?.length && (
                  <div className="tags">
                    {item.tags.map((tag, i) => (
                      <span className="tag" key={`${tag}-${i}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="cardActions">
                  <button
                    type="button"
                    className="textButton"
                    aria-label={`编辑 ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      editItem(item);
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="deleteButton"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItem(item.id);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {selectedProduct && (
        <dialog
          ref={detailDialog}
          className="sheet productDialog"
          aria-labelledby="productDetailTitle"
          onClose={() => setSelectedProduct(null)}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const bounds = e.currentTarget.getBoundingClientRect();
            if (e.clientX < bounds.left || e.clientX > bounds.right ||
                e.clientY < bounds.top || e.clientY > bounds.bottom) {
              e.currentTarget.close();
            }
          }}
        >
          <div className="detailHeader">
            <span>产品详情</span>
            <button
              type="button"
              className="closeButton"
              aria-label="关闭产品详情"
              autoFocus
              onClick={() => detailDialog.current.close()}
            >
              ×
            </button>
          </div>

          {(shareCompany.name || shareCompany.logo) && <div className="detailCompany">
            {shareCompany.logo && <img src={shareCompany.logo} alt="公司 Logo" />}
            {shareCompany.name && <span>{shareCompany.name}</span>}
          </div>}

          <div className="detailImage">
            {selectedProduct.image ? (
              <img src={selectedProduct.image} alt={selectedProduct.name} />
            ) : (
              <div className="placeholder">NO PHOTO</div>
            )}
          </div>
          <h2 id="productDetailTitle">{selectedProduct.name}</h2>
          <p className="detailCode">Product Code: {selectedProduct.serial}</p>
          {!!selectedProduct.tags?.length && (
            <div className="tags detailTags">
              {selectedProduct.tags.map((tag, i) => (
                <span className="tag" key={`${tag}-${i}`}>{tag}</span>
              ))}
            </div>
          )}
          <p className="detailPrice">RM {selectedProduct.price}</p>

          <div className="detailActions">
            <button
              type="button"
              className="whatsappButton"
              disabled={sharing || cardGenerating || !companyReady}
              onClick={() => productCard ? shareProductCard() : setCardAttempt(value => value + 1)}
            >
              {sharing ? "正在打开分享…" : cardGenerating ? "正在准备产品卡片…" : productCard ? "分享卡片到 WhatsApp" : "重新生成产品卡片"}
            </button>
            <button
              type="button"
              className="saveButton"
              disabled={!quotationReady}
              onClick={() => addToQuotation(selectedProduct)}
            >
              ＋ 加入报价清单
            </button>
          </div>
          {productCard && <button type="button" className="cardDownloadButton textButton"
            onClick={() => downloadFile(productCard)} disabled={sharing}>下载产品卡片</button>}
          <p className="detailMessage" role="status" aria-live="polite">{detailMessage}</p>
          {companyError && <p className="quotationError" role="alert">{companyError}</p>}
          {quotationCount > 0 && <button type="button" className="viewQuotationButton" onClick={viewQuotation}>
            查看报价清单（{quotationCount} 件） →
          </button>}
          {quotationError && <p className="quotationError" role="alert">{quotationError}</p>}
        </dialog>
      )}

      {open && (
        <div className="overlay" onMouseDown={closeForm}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheetHeader">
              <div>
                <h2>{editingId ? "编辑产品" : "新增产品"}</h2>
                <p>{editingId ? "修改产品资料后保存" : "填写产品资料后保存"}</p>
              </div>
              <button className="closeButton" aria-label="关闭产品表单" onClick={closeForm}>
                ×
              </button>
            </div>

            <form onSubmit={addItem}>
              <label>
                产品编号 *
                <input
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="例如 P-003"
                  required
                />
              </label>

              <label>
                名称 *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 Sample Product C"
                  required
                />
              </label>

              <label>
                标签
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="分类, 材质, 款式"
                />
                <small>多个标签使用英文逗号分开</small>
              </label>

              <label>
                价格 *
                <div className="priceInput">
                  <span>RM</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    required
                  />
                </div>
              </label>

              <label>
                照片
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    onImageChange(file);
                  }}
                />
                <small>JPG、JPEG、PNG 或 WebP，最大 12MB。保存时自动压缩为 WebP。</small>
              </label>

              {image && <img className="preview" src={image} alt="预览" />}
              {image && <button type="button" className="textButton" onClick={() => {
                imageUploadToken.current += 1;
                setImageLoading(false);
                setFormError("");
                setImage("");
              }}>移除照片</button>}
              {formError && <p className="quotationError" role="alert">{formError}</p>}

              <div className="formActions">
                <button
                  type="button"
                  className="cancelButton"
                  onClick={closeForm}
                >
                  取消
                </button>
                <button className="saveButton" type="submit" disabled={imageLoading}>
                  {imageLoading ? "正在转换图片…" : editingId ? "保存修改" : "保存产品"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
