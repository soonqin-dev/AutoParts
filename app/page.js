"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "autoparts_catalog_vercel_demo_v1";
const QUOTATION_STORAGE_KEY = "autoparts_quotation_v1";

const samples = [
  {
    id: "sample-1",
    serial: "AP-001",
    name: "Toyota Vios Front Brake Pad",
    tags: ["Toyota", "Vios", "Brake"],
    price: "85.00",
    image: ""
  },
  {
    id: "sample-2",
    serial: "AP-002",
    name: "Honda City Air Filter",
    tags: ["Honda", "City", "Filter"],
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
  const [ready, setReady] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quotationItems, setQuotationItems] = useState([]);
  const [quotationReady, setQuotationReady] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [detailMessage, setDetailMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const detailDialog = useRef(null);

  const [serial, setSerial] = useState("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setItems(JSON.parse(saved));
      } else {
        setItems(samples);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
      }
    } catch {
      setItems(samples);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUOTATION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.some((item) =>
          !item?.product?.id || typeof item.product.serial !== "string" ||
          typeof item.product.name !== "string" ||
          !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
          !Number.isFinite(item.unitPrice) || item.unitPrice < 0 ||
          !Number.isFinite(item.lineTotal)
        )) {
          throw new Error("Invalid quotation data");
        }
        setQuotationItems(parsed);
      }
      setQuotationReady(true);
    } catch {
      // Preserve the saved draft if it cannot be read.
      setQuotationError("无法读取报价清单，请检查浏览器存储后刷新重试。");
    }
  }, []);

  useEffect(() => {
    if (!quotationReady) return;
    try {
      localStorage.setItem(QUOTATION_STORAGE_KEY, JSON.stringify(quotationItems));
      setQuotationError("");
    } catch {
      setQuotationError("报价清单未能保存到浏览器，刷新后可能丢失。请检查存储空间。");
    }
  }, [quotationItems, quotationReady]);

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
    setSelectedProduct(item);
  }

  async function shareProduct(item) {
    const text = [
      item.name,
      `Product Code: ${item.serial}`,
      `Price: RM ${item.price}`,
      `Tags: ${(item.tags || []).join(", ")}`
    ].join("\n");

    setDetailMessage("");
    if (typeof navigator.share === "function") {
      setSharing(true);
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // Cancelling the share sheet should not open another app.
        if (error.name === "AbortError") return;
      } finally {
        setSharing(false);
      }
    }

    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  function addToQuotation(item) {
    const unitPrice = Number(item.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setDetailMessage("产品价格无效，无法加入报价清单。");
      return;
    }

    setQuotationItems((prev) => {
      const existing = prev.find((line) => line.product.id === item.id);
      if (existing) {
        return prev.map((line) => line.product.id === item.id
          ? {
              ...line,
              quantity: line.quantity + 1,
              lineTotal: Math.round((line.quantity + 1) * line.unitPrice * 100) / 100
            }
          : line);
      }
      return [...prev, {
        // Keep a small snapshot so catalog deletion does not change the draft.
        product: { id: item.id, serial: item.serial, name: item.name },
        quantity: 1,
        unitPrice,
        lineTotal: Math.round(unitPrice * 100) / 100
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
    setSerial("");
    setName("");
    setTags("");
    setPrice("");
    setImage("");
  }

  function addItem(e) {
    e.preventDefault();
    if (!serial.trim() || !name.trim() || !price.trim()) return;

    const newItem = {
      id: makeId(),
      serial: serial.trim(),
      name: name.trim(),
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      price: Number(price.replace(/[^\d.]/g, "") || 0).toFixed(2),
      image
    };

    setItems((prev) => [newItem, ...prev]);
    resetForm();
    setOpen(false);
  }

  function deleteItem(id) {
    if (!window.confirm("确定删除这项货物资料吗？")) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function onImageChange(file) {
    if (!file) {
      setImage("");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Demo 版建议照片小于 2MB。正式版接 Supabase 后可放更大的图片。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <div className="eyebrow">SALES TOOL</div>
          <h1>AutoParts Catalog</h1>
          <p>Mobile Sales Catalog &amp; Quotation Tool</p>
        </div>
        <div className="badge">{items.length} 项货物</div>
      </section>

      <div className="notice">
        当前为 Vercel Demo。资料暂存在这台手机 / 浏览器里，正式版会改成 Supabase 云端同步。
      </div>

      <div className="quotationSummary" role="status" aria-live="polite">
        报价清单：<strong>{quotationCount} 件</strong>
      </div>
      {quotationError && <p className="quotationError" role="alert">{quotationError}</p>}

      <div className="searchWrap">
        <span className="searchIcon">⌕</span>
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索序号、名称、标签..."
        />
        {query && (
          <button className="clear" onClick={() => setQuery("")}>
            清除
          </button>
        )}
      </div>

      <button className="addButton" onClick={() => setOpen(true)}>
        ＋ 上传货物
      </button>

      <section className="list">
        {filtered.length === 0 ? (
          <div className="empty">没有找到符合的货物。</div>
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

                <div className="serial">序号：{item.serial}</div>

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
              disabled={sharing}
              onClick={() => shareProduct(selectedProduct)}
            >
              {sharing ? "正在打开分享…" : "分享到 WhatsApp"}
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
          <p className="detailMessage" role="status" aria-live="polite">{detailMessage}</p>
          {quotationError && <p className="quotationError" role="alert">{quotationError}</p>}
        </dialog>
      )}

      {open && (
        <div className="overlay" onMouseDown={() => setOpen(false)}>
          <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheetHeader">
              <div>
                <h2>新增货物</h2>
                <p>填写零件资料后保存</p>
              </div>
              <button className="closeButton" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={addItem}>
              <label>
                序号 *
                <input
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="例如 AP-003"
                  required
                />
              </label>

              <label>
                名称 *
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 Toyota Altis Oil Filter"
                  required
                />
              </label>

              <label>
                标签
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Toyota, Altis, Filter"
                />
                <small>多个标签使用英文逗号分开</small>
              </label>

              <label>
                报价 *
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
                  accept="image/*"
                  onChange={(e) => onImageChange(e.target.files?.[0])}
                />
              </label>

              {image && <img className="preview" src={image} alt="预览" />}

              <div className="formActions">
                <button
                  type="button"
                  className="cancelButton"
                  onClick={() => {
                    resetForm();
                    setOpen(false);
                  }}
                >
                  取消
                </button>
                <button className="saveButton" type="submit">
                  保存货物
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
