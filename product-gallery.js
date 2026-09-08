// Explicit administrator lists take precedence over untouched legacy galleries.
window.MinsookGallery = {
  legacy: {
    '한입': ['오이-홈페이지용사진/한입오이 나열.jpg','오이-홈페이지용사진/한입오이-클로즈샷.jpg','오이-홈페이지용사진/한입오이-포장지안.jpg','오이-홈페이지용사진/한입오이포장.jpg'],
    '특품': ['오이-홈페이지용사진/특품오이 (2).jpg','오이-홈페이지용사진/특품오이-박스위.jpg','오이-홈페이지용사진/특품오이-절단샷 (2).jpg','오이-홈페이지용사진/특품오이-절단샷 (3).jpg'],
    '상품': ['오이-홈페이지용사진/공품오이.jpg','오이-홈페이지용사진/공품오이-박스위.jpg','오이-홈페이지용사진/공품오이-절단샷 (2).jpg','오이-홈페이지용사진/공품오이-절단샷 (3).jpg'],
    '공품': ['오이-홈페이지용사진/박스.jpg','오이-홈페이지용사진/오이 절단샷.jpg']
  },
  images(product) {
    const value = String(product.image_url || '').trim();
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.filter(x=>typeof x==='string'&&x); } catch {}
    if (value.startsWith('data:image/')) return [value];
    if (['','minsook_main.jpg','minsook_detail_1.jpg','minsook_detail_2.jpg'].includes(value)) {
      const grade = Object.keys(this.legacy).find(key=>String(product.name).includes(key));
      if (grade) return [...this.legacy[grade]];
    }
    return value.split(',').map(s=>s.trim()).filter(Boolean);
  }
};
