/* Интерактив остаётся улучшением: исходная разметка полностью доступна без JavaScript. */
document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.querySelectorAll("[data-tabs]").forEach((tabsRoot) => {
  const tabs = [...tabsRoot.querySelectorAll('[role="tab"]')];
  const panels = [...tabsRoot.querySelectorAll('[role="tabpanel"]')];

  const activate = (nextTab, moveFocus = true) => {
    tabs.forEach((tab) => {
      const active = tab === nextTab;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = tabsRoot.querySelector(`#${tab.getAttribute("aria-controls")}`);
      panel.hidden = !active;
      if (active && !reducedMotion) {
        panel.classList.remove("is-entering");
        requestAnimationFrame(() => panel.classList.add("is-entering"));
      }
    });
    if (moveFocus) nextTab.focus();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab, false));
    tab.addEventListener("keydown", (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      activate(tabs[nextIndex]);
    });
  });

  panels.forEach((panel, index) => {
    panel.hidden = index !== 0;
  });
});

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = lightbox?.querySelector("[data-lightbox-image]");

if (lightbox && lightboxImage && typeof lightbox.showModal === "function") {
  document.querySelectorAll("[data-lightbox-src]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      lightboxImage.src = trigger.dataset.lightboxSrc;
      lightboxImage.alt = trigger.dataset.lightboxAlt || "";
      lightbox.showModal();
    });
  });

  lightbox.querySelector("[data-lightbox-close]")?.addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener("close", () => {
    lightboxImage.removeAttribute("src");
  });
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const wrapper = button.closest("[data-copy-wrap]");
    const value = wrapper?.querySelector("[data-copy-value]")?.textContent || "";
    const status = wrapper?.querySelector("[data-copy-status]");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(wrapper.querySelector("[data-copy-value]"));
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("copy");
      selection.removeAllRanges();
    }
    button.textContent = button.dataset.copied;
    if (status) status.textContent = button.dataset.copied;
    window.setTimeout(() => {
      button.textContent = button.dataset.label;
      if (status) status.textContent = "";
    }, 1800);
  });
});

const header = document.querySelector(".site-header");
const setHeaderState = () => header?.classList.toggle("is-scrolled", window.scrollY > 8);
setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if ("IntersectionObserver" in window) {
  if (!reducedMotion) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

    document.querySelectorAll(".reveal").forEach((section) => {
      section.classList.add("reveal-ready");
      revealObserver.observe(section);
    });
  }

  const links = new Map(
    [...document.querySelectorAll(".site-nav a[href^='#']")].map((link) => [link.hash.slice(1), link]),
  );
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || !links.has(entry.target.id)) return;
      links.forEach((link, id) => {
        if (id === entry.target.id) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-25% 0px -65%", threshold: 0 });
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) navObserver.observe(section);
  });
}
