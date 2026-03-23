/**
 * When axios uses responseType: 'blob', failed responses are often a Blob containing JSON
 * (e.g. FastAPI { detail: "..." }). This extracts a readable message for alerts.
 */
export async function getAxiosErrorMessage(error, fallback = 'Request failed') {
  if (!error?.response) {
    return error?.message || fallback;
  }
  const data = error.response.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      try {
        const j = JSON.parse(text);
        if (typeof j.detail === 'string') return j.detail;
        if (Array.isArray(j.detail)) {
          return j.detail
            .map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d)))
            .join('; ');
        }
        if (j.message) return j.message;
        return text || fallback;
      } catch {
        return text || fallback;
      }
    } catch {
      return fallback;
    }
  }
  const d = data?.detail ?? data?.message;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || x).join('; ');
  return error.message || fallback;
}
