#!/usr/bin/env python3
# =============================================================================
# FILE: docs/tools/genera_schemi_backend.py
# TARGET DOCUMENTALE: RELAZIONE TECNICA BACKEND DATABASE V3.0
# DESCRIZIONE: rigenerazione PNG degli schemi backend 01-30 e X1-X21
# =============================================================================

"""Rigenera gli schemi della Relazione Tecnica Backend Database v3.0.

Output generati in ``docs/diagrammi``:
- Core_Migration_Pipeline_01-30.png
- Diagnostic_Validation_Patch_Toolkit_X1-X21.png

Lo script genera esclusivamente file PNG. Non produce file SVG.
"""

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch


# Cartella di destinazione: docs/diagrammi.
OUT = Path(__file__).resolve().parent.parent / "diagrammi"
OUT.mkdir(parents=True, exist_ok=True)


# Palette condivisa dai due diagrammi.
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
    "fncsdp": "#FFF0E3",
    "border": "#73828F",
    "text": "#263238",
    "arrow": "#80909B",
}


def setup(title: str, subtitle: str, figsize: tuple[float, float] = (13.5, 9.2)):
    """Prepara una tavola bianca con titolo e sottotitolo."""
    fig, ax = plt.subplots(figsize=figsize)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.patch.set_facecolor("white")

    ax.text(
        0.5,
        0.965,
        title,
        ha="center",
        va="top",
        fontsize=18,
        fontweight="bold",
        color=PALETTE["text"],
        family="DejaVu Sans",
    )
    ax.text(
        0.5,
        0.925,
        subtitle,
        ha="center",
        va="top",
        fontsize=10.5,
        color="#52636E",
        family="DejaVu Sans",
    )
    return fig, ax


def box(
    ax,
    xy: tuple[float, float],
    wh: tuple[float, float],
    title: str,
    lines: list[str],
    face: str,
    title_size: float = 10.0,
    body_size: float = 7.7,
):
    """Disegna un riquadro arrotondato con titolo e righe descrittive."""
    x, y = xy
    w, h = wh

    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.012,rounding_size=0.014",
        linewidth=1.5,
        edgecolor=PALETTE["border"],
        facecolor=face,
    )
    ax.add_patch(patch)

    ax.text(
        x + w / 2,
        y + h - 0.038,
        title,
        ha="center",
        va="top",
        fontsize=title_size,
        fontweight="bold",
        color=PALETTE["text"],
        family="DejaVu Sans",
    )
    ax.text(
        x + w / 2,
        y + h / 2 - 0.018,
        "\n".join(lines),
        ha="center",
        va="center",
        fontsize=body_size,
        color="#394A54",
        family="DejaVu Sans",
        linespacing=1.28,
    )
    return patch


def arrow(
    ax,
    start: tuple[float, float],
    end: tuple[float, float],
) -> None:
    """Disegna una freccia lineare tra due punti."""
    ax.add_patch(
        FancyArrowPatch(
            start,
            end,
            arrowstyle="-|>",
            mutation_scale=12,
            linewidth=1.25,
            color=PALETTE["arrow"],
            shrinkA=4,
            shrinkB=4,
            connectionstyle="arc3,rad=0",
        )
    )


def orth_arrow(ax, points: list[tuple[float, float]]) -> None:
    """Disegna un connettore ortogonale con freccia sull'ultimo segmento."""
    for point_a, point_b in zip(points[:-2], points[1:-1]):
        ax.plot(
            [point_a[0], point_b[0]],
            [point_a[1], point_b[1]],
            color=PALETTE["arrow"],
            linewidth=1.25,
        )
    arrow(ax, points[-2], points[-1])


def save(fig, stem: str) -> Path:
    """Salva la figura esclusivamente in formato PNG e restituisce il percorso."""
    png_path = OUT / f"{stem}.png"
    fig.savefig(
        png_path,
        dpi=300,
        bbox_inches="tight",
        facecolor="white",
    )
    plt.close(fig)
    return png_path


def core_pipeline() -> Path:
    """Genera il diagramma Core Migration Pipeline 01-30."""
    fig, ax = setup(
        "CORE MIGRATION PIPELINE (01-30)",
        "Evoluzione sequenziale del backend PostgreSQL/Supabase",
    )

    width, height = 0.275, 0.165
    x_positions = [0.04, 0.3625, 0.685]
    y_positions = [0.695, 0.46, 0.225]

    specs = [
        (
            0,
            0,
            "FASE 1 - BASELINE E SICUREZZA",
            ["01 Schema iniziale", "02 Dataset controllato", "03 RLS", "04 Privilegi e DCL"],
            PALETTE["blue"],
        ),
        (
            1,
            0,
            "FASE 2 - VISTE, AUDIT E TEMPO",
            ["05 Viste ACN", "06 Audit asset", "07 Time-zone", "08 Policy di lettura"],
            PALETTE["green"],
        ),
        (
            2,
            0,
            "FASE 3 - INCIDENTI ACN",
            ["09 Strutture tassonomiche", "10 Popolamento tassonomia", "11 Hardening eventi"],
            PALETTE["sand"],
        ),
        (
            0,
            1,
            "FASE 4 - HARDENING E GERARCHIE",
            ["12 Vincoli di dominio", "13 Gerarchia servizi", "14 Gerarchia asset"],
            PALETTE["lav"],
        ),
        (
            1,
            1,
            "FASE 5 - FORNITORI E RELAZIONI",
            ["15 Gerarchia fornitori", "16 Relazione asset-fornitore"],
            PALETTE["cyan"],
        ),
        (
            2,
            1,
            "FASE 6 - SUPPLY CHAIN E AUDIT",
            ["17 Viste multilivello", "18 Reporting corretto", "19 Audit generalizzato"],
            PALETTE["rose"],
        ),
        (
            0,
            2,
            "FASE 7 - CONSERVAZIONE E CHIUSURA",
            ["20 Archiviazione logica", "21 Eliminazione ultimo CASCADE"],
            PALETTE["slate"],
        ),
        (
            1,
            2,
            "FASE 8 - ACCESSO OPERATIVO",
            ["22 Accesso valutazione asset", "23 Policy sulle 14 tabelle"],
            PALETTE["mint"],
        ),
        (
            2,
            2,
            "FASE 9 - QUALITA DEI DATI",
            ["24 Archivio asset dimostrativi", "25 Terminologia neutrale", "26 Contatto normalizzato"],
            PALETTE["gold"],
        ),
    ]

    centers: dict[tuple[int, int], tuple[float, float]] = {}

    for column, row, title, lines, face in specs:
        x_position = x_positions[column]
        y_position = y_positions[row]
        box(
            ax,
            (x_position, y_position),
            (width, height),
            title,
            lines,
            face,
        )
        centers[(column, row)] = (
            x_position + width / 2,
            y_position + height / 2,
        )

    path = [
        (0, 0),
        (1, 0),
        (2, 0),
        (0, 1),
        (1, 1),
        (2, 1),
        (0, 2),
        (1, 2),
        (2, 2),
    ]

    for source, destination in zip(path, path[1:]):
        source_x, source_y = centers[source]
        destination_x, destination_y = centers[destination]

        if source[1] == destination[1]:
            arrow(
                ax,
                (source_x + width / 2 - 0.012, source_y),
                (destination_x - width / 2 + 0.012, destination_y),
            )
        else:
            middle_y = (
                source_y - height / 2 + destination_y + height / 2
            ) / 2
            orth_arrow(
                ax,
                [
                    (source_x, source_y - height / 2 + 0.005),
                    (source_x, middle_y),
                    (destination_x, middle_y),
                    (destination_x, destination_y + height / 2 - 0.005),
                ],
            )

    final_x, final_y = 0.19, 0.055
    final_width, final_height = 0.62, 0.115

    box(
        ax,
        (final_x, final_y),
        (final_width, final_height),
        "FASE 10 - GOVERNANCE, ACCESSI E ASSESSMENT FNCSDP",
        [
            "27 Soggetti NIS2 e incarichi storicizzati   |   28 Cataloghi dipendenze e impatti",
            "29 Login, logout e MFA nell'Audit Log       |   30 Profili Target e Attuale FNCSDP",
        ],
        PALETTE["fncsdp"],
        title_size=10.6,
        body_size=8.0,
    )

    source_x, source_y = centers[(2, 2)]
    middle_y = (
        source_y - height / 2 + final_y + final_height
    ) / 2
    orth_arrow(
        ax,
        [
            (source_x, source_y - height / 2 + 0.005),
            (source_x, middle_y),
            (final_x + final_width / 2, middle_y),
            (final_x + final_width / 2, final_y + final_height - 0.005),
        ],
    )

    ax.text(
        0.5,
        0.018,
        "Risultato consolidato: 36 tabelle, 11 viste principali, 3FN preservata, RLS, audit e valutazione FNCSDP.",
        ha="center",
        va="center",
        fontsize=8.8,
        color="#52636E",
        family="DejaVu Sans",
    )

    return save(fig, "Core_Migration_Pipeline_01-30")


def diagnostic_toolkit() -> Path:
    """Genera il diagramma Diagnostic, Validation & Patch Toolkit X1-X21."""
    fig, ax = setup(
        "DIAGNOSTIC, VALIDATION & PATCH TOOLKIT (X1-X21)",
        "Controlli progressivi sul database live, readiness, sicurezza, accessi e Assessment FNCSDP",
    )

    specs = [
        (
            0.05,
            0.64,
            0.40,
            0.21,
            "ISPEZIONE STRUTTURALE E SICUREZZA",
            [
                "X1 schema e colonne",
                "X2 colonne delle viste",
                "X6 trigger e funzioni",
                "X7 vincoli",
                "X9 viste e privilegi",
                "X10 policy RLS e grant",
            ],
            PALETTE["blue"],
        ),
        (
            0.55,
            0.64,
            0.40,
            0.21,
            "BONIFICA E PROTOTIPAZIONE CONTROLLATA",
            [
                "X3 allineamento servizi",
                "X4 dataset Supply Chain",
                "X5 prototipo audit JSON",
            ],
            PALETTE["sand"],
        ),
        (
            0.05,
            0.36,
            0.40,
            0.21,
            "READINESS DEL MODELLO",
            [
                "X8 duplicati e organizzazioni",
                "X11-X12 readiness fornitori",
                "X13 Supply Chain multilivello",
                "X14 reporting",
                "X15 audit",
                "X16 archiviazione",
            ],
            PALETTE["green"],
        ),
        (
            0.55,
            0.36,
            0.19,
            0.21,
            "CHIUSURA STRUTTURALE",
            ["X17 verifica finale", "backend superata"],
            PALETTE["lav"],
        ),
        (
            0.76,
            0.36,
            0.19,
            0.21,
            "ACCESSI E QUALITA",
            ["X18 AAL/MFA", "X19 dati e anomalie"],
            PALETTE["mint"],
        ),
        (
            0.05,
            0.105,
            0.40,
            0.18,
            "AUDIT DEGLI ACCESSI APPLICATIVI",
            [
                "X20 verifica LOGIN, LOGOUT e MFA_VERIFICATA",
                "Privilegi, contesto utente e coerenza dell'Audit Log",
            ],
            PALETTE["rose"],
        ),
        (
            0.55,
            0.105,
            0.40,
            0.18,
            "VALIDAZIONE ASSESSMENT FNCSDP",
            [
                "X21 verifica 36 tabelle e 11 viste",
                "3FN, RLS, trigger, mapping, misure, score e gap",
            ],
            PALETTE["fncsdp"],
        ),
    ]

    for x_position, y_position, width, height, title, lines, face in specs:
        box(
            ax,
            (x_position, y_position),
            (width, height),
            title,
            lines,
            face,
            title_size=10.2,
            body_size=7.8,
        )

    arrow(ax, (0.45, 0.745), (0.55, 0.745))
    arrow(ax, (0.25, 0.64), (0.25, 0.57))
    orth_arrow(
        ax,
        [(0.75, 0.64), (0.75, 0.605), (0.645, 0.605), (0.645, 0.57)],
    )
    arrow(ax, (0.45, 0.465), (0.55, 0.465))
    arrow(ax, (0.74, 0.465), (0.76, 0.465))
    orth_arrow(
        ax,
        [(0.645, 0.36), (0.645, 0.32), (0.25, 0.32), (0.25, 0.285)],
    )
    orth_arrow(
        ax,
        [(0.855, 0.36), (0.855, 0.32), (0.75, 0.32), (0.75, 0.285)],
    )
    arrow(ax, (0.45, 0.195), (0.55, 0.195))

    ax.text(
        0.5,
        0.04,
        "Esiti consolidati: X17 chiude il backend storico; X20 valida gli accessi; X21 certifica il modulo FNCSDP.",
        ha="center",
        va="center",
        fontsize=8.8,
        color="#52636E",
        family="DejaVu Sans",
    )

    return save(fig, "Diagnostic_Validation_Patch_Toolkit_X1-X21")


def main() -> None:
    """Genera entrambi i diagrammi e stampa i relativi percorsi."""
    generated_files = (
        core_pipeline(),
        diagnostic_toolkit(),
    )

    for generated_file in generated_files:
        print(generated_file)


if __name__ == "__main__":
    main()
