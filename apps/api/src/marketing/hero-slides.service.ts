import { Injectable } from "@nestjs/common";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { mapPublicHeroSlide } from "./mappers/hero-slide.mapper.ts";
import type { HeroSlideResponse } from "./dto/responses.ts";

@Injectable()
export class HeroSlidesService {
  constructor(private readonly prisma: PrismaService) {}

  // Only isActive slides, ordered by position — draft/paused slides exist
  // for the admin to queue up or pull without losing their place, but must
  // never reach the storefront (same "only PUBLISHED is ever public"
  // posture as ProductsService.list).
  async listActive(locale: AppLocale): Promise<HeroSlideResponse[]> {
    const slides = await this.prisma.heroSlide.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
    });
    return slides.map((slide) => mapPublicHeroSlide(slide, locale));
  }
}
