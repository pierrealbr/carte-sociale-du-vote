// Case « Mode clair » : force le thème clair même si l'ordinateur est en sombre.
// Chargé dans <head> pour appliquer le choix avant l'affichage (pas de flash).
(function () {
  const lire = () => { try { return localStorage.getItem("theme"); } catch (e) { return null; } };
  const appliquer = clair => { if (clair) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme; };
  appliquer(lire() === "light");
  document.addEventListener("DOMContentLoaded", () => {
    const cb = document.getElementById("theme"); if (!cb) return;
    const sombreSysteme = window.matchMedia("(prefers-color-scheme: dark)");
    const maj = () => { cb.closest(".theme").hidden = !sombreSysteme.matches && !cb.checked; };
    cb.checked = lire() === "light"; maj();
    sombreSysteme.addEventListener("change", maj);
    cb.addEventListener("change", () => {
      try { cb.checked ? localStorage.setItem("theme", "light") : localStorage.removeItem("theme"); } catch (e) {}
      appliquer(cb.checked); document.dispatchEvent(new Event("theme"));
    });
  });
})();
