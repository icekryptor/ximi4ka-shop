import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddBlogPosts1782990526173 implements MigrationInterface {
    name = 'AddBlogPosts1782990526173'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "blog_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying(255) NOT NULL, "title" character varying(500) NOT NULL, "excerpt" text, "cover_image_url" character varying(500), "rubric" character varying(255), "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb, "meta_title" character varying(255), "meta_description" text, "og_image" character varying(500), "canonical_url" character varying(500), "noindex" boolean NOT NULL DEFAULT false, "translations" jsonb NOT NULL DEFAULT '{}'::jsonb, "is_published" boolean NOT NULL DEFAULT false, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_5b2818a2c45c3edb9991b1c7a51" UNIQUE ("slug"), CONSTRAINT "PK_dd2add25eac93daefc93da9d387" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "blog_posts"`);
    }

}
