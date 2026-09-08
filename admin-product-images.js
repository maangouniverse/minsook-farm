/* Small, separate durable photo requests; never store uploads on server disk. */
window.MinsookImages = {
  busy: false,
  async prepare(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`${file.name}: JPG, PNG, WebP 사진을 선택해 주세요.`);
    if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name}: 40MB 이하의 사진을 선택해 주세요.`);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for (const quality of [.84, .72, .58, .42]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length < 1100000) return data;
      }
      throw new Error(`${file.name}: 사진을 충분히 줄일 수 없습니다. 더 작은 사진을 선택해 주세요.`);
    } catch (error) { throw new Error(error.message.includes(file.name) ? error.message : `${file.name}: 사진을 읽지 못했습니다. JPG 또는 PNG로 다시 저장해 주세요.`); }
    finally { URL.revokeObjectURL(url); }
  },
  async persist(images) {
    const result = [];
    for (let i = 0; i < images.length; i++) {
      if (!images[i].startsWith('data:')) { result.push(images[i]); continue; }
      document.getElementById('productSaveFeedback').textContent = `사진 ${i+1}/${images.length} 저장 중…`;
      const response = await fetch('/api/admin/product-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({dataUrl:images[i]}) });
      let data; try { data = await response.json(); } catch { data = {}; }
      if (!response.ok || !data.url) throw new Error(data.error || (response.status === 413 ? '사진 용량이 너무 큽니다. 사진을 다시 선택해 주세요.' : response.status === 401 ? '로그인이 만료됐습니다. 다시 로그인해 주세요.' : '사진 저장에 실패했습니다. 다시 시도해 주세요.'));
      result.push(data.url);
    }
    return result;
  }
};
