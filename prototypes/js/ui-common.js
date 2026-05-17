/**
 * 古典系页面通用：顶栏下拉、API 基址
 */
(function () {
  function initUserDropdown() {
    const userDropdown = document.getElementById("userDropdown");
    if (!userDropdown || userDropdown.dataset.dropdownWired === "1") return;
    userDropdown.dataset.dropdownWired = "1";
    const avatar = userDropdown.querySelector(".user-avatar");
    if (!avatar) return;
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => userDropdown.classList.remove("open"));
  }

  window.ChoirUI = { initUserDropdown };
})();
