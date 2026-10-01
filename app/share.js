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
