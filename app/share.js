export function productShareText(item) {
  return [
    `*${item.name}*`,
    `*Product Code*: ${item.serial}`,
    `*Price*: RM ${item.price}`,
    `*Tags*: ${(item.tags || []).map(tag => `\`${tag}\``).join(", ")}`
  ].join("\n");
}
}

export function whatsappLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function photoFile(item) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(item.image || "");
  if (!match) throw new Error("无法读取照片，请重新上传产品照片。");
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif",
    "image/heic": "heic", "image/heif": "heif", "image/bmp": "bmp" }[match[1].toLowerCase()] || "img";
  const name = (item.serial || "product").replace(/[^\w-]/g, "_");
  return new File([bytes], `${name}.${extension}`, { type: match[1] });
}

export function canShareFile(file) {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give mobile browsers time to start their download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
