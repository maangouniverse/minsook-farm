/* Carrier workbook: local-only export, no order/status writes or external calls. */
(function(root) {
  const format = typeof module !== 'undefined' ? require('./shipping-format.js') : root.MinsookShippingFormat;
  const clean = value => String(value ?? '').replace(/\b(undefined|null)\b/gi, '').replace(/\s+/g, ' ').trim();
  const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function targets(all, filtered, selectedIds) {
    const selected = new Set(selectedIds.map(String));
    const source = selected.size ? all.filter(o=>selected.has(String(o.id))) : filtered;
    return source.filter(o=>!String(o.address || '').includes('[직접 픽업]'));
  }
  function orderRow(order) {
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    if (!Array.isArray(items) || !items.length) throw new Error(`주문 #${order.id}: 상품 내역을 확인해 주세요.`);
    let grams = 0;
    const descriptions = items.map(item => {
      const quantity = Number(item.quantity), unit = clean(item.unit);
      if (!Number.isFinite(quantity) || quantity <= 0 || !['kg','개','g'].includes(unit)) throw new Error(`주문 #${order.id}: 상품 수량 또는 무게 단위를 확인해 주세요.`);
      grams += Math.round(quantity * (unit === 'kg' ? 1000 : unit === '개' ? 180 : 1));
      return `${clean(item.name)} ${quantity}${unit}`;
    });
    let address = clean(order.basicAddress ? [order.basicAddress,order.detailAddress].filter(Boolean).join(' ') : order.address);
    const code = address.match(/^\[(\d{5,6})\]\s*/);
    const postcode = clean(order.postcode || code?.[1]);
    if (code) address = address.slice(code[0].length);
    address = clean(address.split(/\s*\/\s*지번:/)[0].replace(/^도로명:\s*/,''));
    return [clean(order.name),clean(order.phone),'',clean(order.phone),postcode,address,1,descriptions.join(', '),grams < 10000 ? 'c' : 'd','선불','',clean(order.memo)];
  }
  // Minimal uncompressed ZIP container. UTF-8 OOXML parts preserve all source
  // styles without a CDN export library silently dropping borders/alignment.
  function zip(parts) {
    const encoder = new TextEncoder();
    const crcTable = Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1 ? 0xedb88320^(n>>>1) : n>>>1;return n>>>0;});
    const crc32 = bytes => {let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
    const chunks=[],central=[];let offset=0,centralSize=0;
    for (const [filename,content] of Object.entries(parts)) {
      const name=encoder.encode(filename), data=encoder.encode(content), crc=crc32(data);
      const head=new Uint8Array(30+name.length), h=new DataView(head.buffer);
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);head.set(name,30);
      const entry=new Uint8Array(46+name.length), v=new DataView(entry.buffer);
      v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);entry.set(name,46);
      chunks.push(head,data);central.push(entry);offset+=head.length+data.length;centralSize+=entry.length;
    }
    const end=new Uint8Array(22), e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    const result=new Uint8Array(offset+centralSize+22);let at=0;for(const part of [...chunks,...central,end]){result.set(part,at);at+=part.length;}return result;
  }
  function build(orders) {
    const rows=[format.headers,...orders.map(orderRow)];
    const rowXml=rows.map((row,i)=>{
      const styles=format.rowStyles[i] || format.rowStyles[1];
      return `<row r="${i+1}" ht="${format.rowHeights[i] || format.defaultRowHeight}" customHeight="1">${row.map((value,j)=>{
        const ref=String.fromCharCode(65+j)+(i+1), s=styles[j];
        return typeof value === 'number' ? `<c r="${ref}" s="${s}"><v>${value}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
      '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${xml(format.sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${rel}/theme" Target="theme/theme1.xml"/></Relationships>`,
      'xl/styles.xml':format.stylesXml,'xl/theme/theme1.xml':format.themeXml,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><dimension ref="A1:L${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultColWidth="12.625" defaultRowHeight="${format.defaultRowHeight}"/><cols>${format.columns.map(c=>`<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('')}</cols><sheetData>${rowXml}</sheetData></worksheet>`
    });
  }
  const api={targets,orderRow,build};
  if (typeof module !== 'undefined') { module.exports=api; return; }
  root.MinsookShipping=api;
  let confirming=false;
  function confirmDownload(count,selected) {
    return new Promise(resolve=>{
      const opener=document.activeElement, dialog=document.createElement('dialog');
      dialog.setAttribute('aria-labelledby','shippingExportTitle');
      dialog.style.cssText='width:440px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:24px;border:1px solid #cbd9c1;border-radius:6px;color:#25331e;background:white;box-sizing:border-box;font:inherit;';
      dialog.innerHTML=`<h3 id="shippingExportTitle" style="font-size:20px;margin:0 0 16px">택배 주문 ${count}건 다운로드</h3><p>${selected?'선택한 주문만':'현재 검색·기간·상태 필터에 해당하는 주문만'} 포함합니다. 픽업 주문은 제외합니다.</p><p>주문당 1박스 · 선불<br>10kg 미만 c / 10kg 이상 d</p><p>다운로드해도 주문 상태와 송장번호는 바뀌지 않습니다.</p><div style="display:flex;gap:8px;margin-top:20px"><button type="button" class="btn-action" data-cancel style="flex:1;min-height:44px">취소</button><button type="button" class="btn-action btn-action-primary" data-download style="flex:1;min-height:44px">다운로드</button></div>`;
      const finish=accepted=>{dialog.close();dialog.remove();opener?.focus();resolve(accepted);};
      dialog.querySelector('[data-cancel]').onclick=()=>finish(false);
      dialog.querySelector('[data-download]').onclick=()=>finish(true);
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
      document.body.append(dialog);dialog.showModal();
    });
  }
  root.downloadExcel=async()=>{
    if(confirming) return;
    const ids=[...document.querySelectorAll('.order-checkbox:checked')].map(cb=>cb.getAttribute('data-id'));
    const orders=targets(root.allOrders || [],root.filteredOrders || [],ids);
    if (!orders.length) { showToast('다운로드할 택배 주문이 없습니다. 픽업 주문은 제외됩니다.'); return; }
    confirming=true;
    const accepted=await confirmDownload(orders.length,ids.length>0);
    confirming=false;
    if (!accepted) return;
    try {
      const bytes=build(orders), url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link=document.createElement('a');link.href=url;link.download=`${new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())}_민숙농장_택배${orders.length}건.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      showToast(`택배 주문 ${orders.length}건의 엑셀 파일을 만들었습니다.`);
    } catch(error) { showToast(`엑셀 생성 실패: ${error.message}`); }
  };
})(typeof window === 'undefined' ? {} : window);
