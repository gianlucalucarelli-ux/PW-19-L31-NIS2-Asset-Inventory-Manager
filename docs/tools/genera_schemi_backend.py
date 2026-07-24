#!/usr/bin/env python3
"""Rigenera gli schemi della Relazione Tecnica Backend Database v2.2.

Output:
- Core_Migration_Pipeline_01-26.png/.svg
- Diagnostic_Validation_Patch_Toolkit_X1-X19.png/.svg
"""
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = Path(__file__).resolve().parent.parent / "diagrammi"
OUT.mkdir(parents=True, exist_ok=True)

PALETTE = {
    "blue": "#E7F1F8",
    "green": "#E8F3EC",
    "sand": "#F8F0DF",
    "lav": "#F2EAF5",
    "cyan": "#E7F4F4",
    "rose": "#F7E9EA",
    "slate": "#E9EFF6",
    "mint": "#E8F5F1",
    "gold": "#F7F1DE",
    "border": "#73828F",
    "text": "#263238",
    "accent": "#1F6175",
    "arrow": "#80909B",
}


def setup(title: str, subtitle: str, figsize=(13.5, 8.5)):
    fig, ax = plt.subplots(figsize=figsize)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.patch.set_facecolor("white")
    ax.text(0.5, 0.955, title, ha="center", va="top", fontsize=18,
            fontweight="bold", color=PALETTE["text"], family="DejaVu Sans")
    ax.text(0.5, 0.915, subtitle, ha="center", va="top", fontsize=10.5,
            color="#52636E", family="DejaVu Sans")
    return fig, ax


def box(ax, xy, wh, title, lines, face, title_size=11.5, body_size=8.3):
    x, y = xy
    w, h = wh
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.012,rounding_size=0.014",
        linewidth=1.5, edgecolor=PALETTE["border"], facecolor=face
    )
    ax.add_patch(patch)
    ax.text(x + w/2, y + h - 0.045, title, ha="center", va="top",
            fontsize=title_size, fontweight="bold", color=PALETTE["text"],
            family="DejaVu Sans")
    ax.text(x + w/2, y + h/2 - 0.018, "\n".join(lines), ha="center", va="center",
            fontsize=body_size, color="#394A54", family="DejaVu Sans",
            linespacing=1.35)
    return patch


def arrow(ax, start, end):
    ax.add_patch(FancyArrowPatch(
        start, end, arrowstyle="-|>", mutation_scale=12,
        linewidth=1.25, color=PALETTE["arrow"], shrinkA=4, shrinkB=4,
        connectionstyle="arc3,rad=0"
    ))


def save(fig, stem):
    png = OUT / f"{stem}.png"
    svg = OUT / f"{stem}.svg"
    fig.savefig(png, dpi=300, bbox_inches="tight", facecolor="white")
    fig.savefig(svg, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return png, svg


def core_pipeline():
    fig, ax = setup(
        "CORE MIGRATION PIPELINE (01-26)",
        "Evoluzione sequenziale del backend PostgreSQL/Supabase"
    )
    w, h = 0.275, 0.185
    xs = [0.04, 0.3625, 0.685]
    ys = [0.67, 0.405, 0.14]
    specs = [
        (0, 0, "FASE 1 - BASELINE E SICUREZZA", ["01 Schema iniziale", "02 Dataset controllato", "03 RLS", "04 Privilegi e DCL"], PALETTE["blue"]),
        (1, 0, "FASE 2 - VISTE, AUDIT E TEMPO", ["05 Viste ACN", "06 Audit asset", "07 Timezone", "08 Policy di lettura"], PALETTE["green"]),
        (2, 0, "FASE 3 - INCIDENTI ACN", ["09 Strutture tassonomiche", "10 Popolamento tassonomia", "11 Hardening eventi"], PALETTE["sand"]),
        (0, 1, "FASE 4 - HARDENING E GERARCHIE", ["12 Vincoli di dominio", "13 Gerarchia servizi", "14 Gerarchia asset"], PALETTE["lav"]),
        (1, 1, "FASE 5 - FORNITORI E RELAZIONI", ["15 Gerarchia fornitori", "16 Relazione asset-fornitore"], PALETTE["cyan"]),
        (2, 1, "FASE 6 - SUPPLY CHAIN E AUDIT", ["17 Viste multilivello", "18 Reporting corretto", "19 Audit generalizzato"], PALETTE["rose"]),
        (0, 2, "FASE 7 - CONSERVAZIONE", ["20 Archiviazione logica", "21 Eliminazione ultimo CASCADE"], PALETTE["slate"]),
        (1, 2, "FASE 8 - ACCESSO OPERATIVO", ["22 Funzione fn_accesso_operativo", "23 Estensione policy su 14 tabelle"], PALETTE["mint"]),
        (2, 2, "FASE 9 - QUALITA E NORMALIZZAZIONE", ["24 Archivio asset dimostrativi", "25 Terminologia neutrale", "26 Contatto responsabile"], PALETTE["gold"]),
    ]
    centers = {}
    for c, r, title, lines, face in specs:
        x, y = xs[c], ys[r]
        box(ax, (x, y), (w, h), title, lines, face, title_size=9.3, body_size=7.7)
        centers[(c, r)] = (x + w/2, y + h/2)
    path = [(0,0),(1,0),(2,0),(0,1),(1,1),(2,1),(0,2),(1,2),(2,2)]
    for a, b in zip(path, path[1:]):
        ax1, ay1 = centers[a]
        bx, by = centers[b]
        if a[1] == b[1]:
            arrow(ax, (ax1+w/2-0.012, ay1), (bx-w/2+0.012, by))
        else:
            arrow(ax, (ax1, ay1-h/2+0.012), (bx, by+h/2-0.012))
    ax.text(0.5, 0.055,
            "Risultato consolidato: 30 tabelle, 7 viste principali, RLS, audit generalizzato, accesso operativo controllato e conservazione logica.",
            ha="center", va="center", fontsize=9, color="#52636E", family="DejaVu Sans")
    return save(fig, "Core_Migration_Pipeline_01-26")


def diagnostic_toolkit():
    fig, ax = setup(
        "DIAGNOSTIC, VALIDATION & PATCH TOOLKIT (X1-X19)",
        "Controlli progressivi sul database live, sicurezza degli accessi e qualita dei dati"
    )
    specs = [
        (0.06, 0.61, 0.40, 0.235, "ISPEZIONE STRUTTURALE E SICUREZZA",
         ["X1 schema e colonne", "X2 colonne delle viste", "X6 trigger e funzioni", "X7 vincoli", "X9 viste e privilegi", "X10 policy RLS e grant"], PALETTE["blue"]),
        (0.54, 0.61, 0.40, 0.235, "BONIFICA E PROTOTIPAZIONE CONTROLLATA",
         ["X3 allineamento servizi", "X4 dataset Supply Chain", "X5 prototipo audit JSON"], PALETTE["sand"]),
        (0.06, 0.31, 0.40, 0.235, "READINESS DEL MODELLO",
         ["X8 duplicati e organizzazioni", "X11-X12 readiness fornitori", "X13 Supply Chain multilivello", "X14 reporting", "X15 audit", "X16 archiviazione"], PALETTE["green"]),
        (0.54, 0.31, 0.19, 0.235, "CHIUSURA STRUTTURALE",
         ["X17 verifica finale", "backend superata"], PALETTE["lav"]),
        (0.75, 0.31, 0.19, 0.235, "ACCESSI E MFA",
         ["X18 utenze", "AAL e privilegi", "eccezione docente"], PALETTE["mint"]),
        (0.30, 0.065, 0.40, 0.17, "QUALITA E NORMALIZZAZIONE DATI",
         ["X19 anomalie, record dimostrativi e riferimenti settoriali", "Evidenza per le migrazioni 24-26"], PALETTE["gold"]),
    ]
    for x,y,w,h,title,lines,face in specs:
        box(ax,(x,y),(w,h),title,lines,face,title_size=10.5,body_size=8.0)
    arrow(ax,(0.46,0.73),(0.54,0.73))
    arrow(ax,(0.26,0.61),(0.26,0.545))
    arrow(ax,(0.74,0.61),(0.635,0.545))
    arrow(ax,(0.46,0.43),(0.54,0.43))
    arrow(ax,(0.73,0.43),(0.75,0.43))
    arrow(ax,(0.645,0.31),(0.54,0.235))
    arrow(ax,(0.845,0.31),(0.62,0.235))
    ax.text(0.5, 0.025,
            "Esito: X17 certifica la chiusura strutturale; X18 valida l'accesso operativo; X19 guida la normalizzazione controllata dei dati.",
            ha="center", va="center", fontsize=8.8, color="#52636E", family="DejaVu Sans")
    return save(fig, "Diagnostic_Validation_Patch_Toolkit_X1-X19")


if __name__ == "__main__":
    for p in (*core_pipeline(), *diagnostic_toolkit()):
        print(p)
