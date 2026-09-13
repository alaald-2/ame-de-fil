import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.ts";
import { ImagesModule } from "../images/images.module.ts";
import { HeroSlidesController } from "./hero-slides.controller.ts";
import { HeroSlidesService } from "./hero-slides.service.ts";
import { AdminHeroSlidesController } from "./admin-hero-slides.controller.ts";
import { AdminHeroSlidesService } from "./admin-hero-slides.service.ts";
import { HomepageSectionsController } from "./homepage-sections.controller.ts";
import { HomepageSectionsService } from "./homepage-sections.service.ts";
import { AdminHomepageSectionsController } from "./admin-homepage-sections.controller.ts";
import { AdminHomepageSectionsService } from "./admin-homepage-sections.service.ts";

// Homepage marketing content — the hero slider and the homepage's two named
// section images (HomepageSection's own schema comment). Its own top-level
// module rather than folded into CatalogModule: this content is about the
// storefront itself, not a property of any catalog entity, and reuses
// ImagesModule's IMAGE_STORAGE_PROVIDER the same way CatalogModule does,
// under its own Cloudinary folders.
@Module({
  imports: [AuditModule, ImagesModule],
  controllers: [
    HeroSlidesController,
    AdminHeroSlidesController,
    HomepageSectionsController,
    AdminHomepageSectionsController,
  ],
  providers: [
    HeroSlidesService,
    AdminHeroSlidesService,
    HomepageSectionsService,
    AdminHomepageSectionsService,
  ],
})
export class MarketingModule {}
