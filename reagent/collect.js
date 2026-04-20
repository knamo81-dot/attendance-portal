window.ReagentApp = window.ReagentApp || {};

window.ReagentApp.collect = {
  addSelectedToCollect() {
    const request = window.ReagentApp.request;
    const groups = request.groupItems(request.requestRows);
    const selected = groups.filter((g) => request.selectedKeys.includes(g.key));

    if (!selected.length) {
      return window.ReagentApp.toast("선택된 품목이 없습니다.", "warn");
    }

    selected.forEach((group) => {
      request.collectedMeta[group.key] = group.totalQty;
    });

    request.saveCollectedMeta();
    request.selectedKeys = [];
    request.saveSelectedKeys();

    request.renderRequest();
    this.renderCollect();

    window.ReagentApp.toast("선택한 항목이 제품취합에 반영되었습니다.", "success");
  },

  renderCollect() {
    const { els, escapeHtml } = window.ReagentApp;
    const request = window.ReagentApp.request;

    let groups = request.groupItems(request.requestRows)
      .filter((g) => Number(request.collectedMeta[g.key] || 0) > 0);

    const keyword = (els.collectKeyword?.value || "").trim().toLowerCase();
    const category = els.collectCategory?.value || "";

    if (keyword) {
      groups = groups.filter((g) =>
        [g.name, g.maker, g.code].join(" ").toLowerCase().includes(keyword)
      );
    }

    if (category) {
      groups = groups.filter((g) => g.category === category);
    }

    if (!groups.length) {
      els.collectList.innerHTML = `<tr><td colspan="15" class="empty">취합할 항목이 없습니다.</td></tr>`;
      return;
    }

    els.collectList.innerHTML = groups.map((group) => `
      <tr>
        <td><input type="checkbox" disabled></td>
        <td>${escapeHtml(group.name)}</td>
        <td>${escapeHtml(group.maker)}</td>
        <td>${escapeHtml(group.code)}</td>
        <td>${escapeHtml(group.capacity)}</td>
        <td>${escapeHtml(group.cas)}</td>
        <td>${escapeHtml(group.grade)}</td>
        <td>
          ${group.collectedQty > 0 ? `완료 ${group.collectedQty}<br>` : ""}
          ${group.newQty > 0 ? `추가 ${group.newQty}` : ""}
        </td>
        <td><button class="ghost-btn" disabled>상세보기</button></td>
        <td>10,000</td>
        <td>${(group.totalQty * 10000).toLocaleString("ko-KR")}</td>
        <td>거래처A</td>
        <td>12,000</td>
        <td>${(group.totalQty * 12000).toLocaleString("ko-KR")}</td>
        <td>거래처B</td>
      </tr>
    `).join("");

    els.collectCount.textContent = String(groups.length);
    els.collectQty.textContent = String(groups.reduce((sum, g) => sum + g.totalQty, 0));

    const mixR = groups.filter((g) => g.category === "시약").length;
    const mixG = groups.filter((g) => g.category === "초자").length;
    const mixS = groups.filter((g) => g.category === "안전용품").length;

    els.collectMix.textContent = `${mixR} / ${mixG} / ${mixS}`;
  }
};
