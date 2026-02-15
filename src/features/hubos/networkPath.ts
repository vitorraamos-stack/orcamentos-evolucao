const NETWORK_BASE_PATH = (import.meta.env.VITE_OS_FOLDER_BASE as string | undefined)?.trim() ?? "";

export const getNetworkBasePath = () => NETWORK_BASE_PATH;

export const toFileUriFromUncPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed.startsWith("\\\\")) return null;

  const withoutPrefix = trimmed.slice(2);
  const encodedPath = withoutPrefix
    .split("\\")
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join("/");

  return `file://${encodedPath}`;
};

export const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (error) {
    const fallbackInput = document.createElement("textarea");
    fallbackInput.value = value;
    fallbackInput.style.position = "fixed";
    fallbackInput.style.opacity = "0";
    fallbackInput.style.pointerEvents = "none";
    document.body.appendChild(fallbackInput);
    fallbackInput.focus();
    fallbackInput.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(fallbackInput);
    if (!copied) {
      throw error;
    }
    return true;
  }
};
