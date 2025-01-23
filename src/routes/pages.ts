import express from "express";
import type { Request, Response } from "express";
import { getLogger } from "guzek-uk-common/lib/logger";
import { Page, PageContent } from "guzek-uk-common/lib/sequelize";
import {
  createDatabaseEntry,
  deleteDatabaseEntry,
  readAllDatabaseEntries,
  updateDatabaseEntry,
} from "guzek-uk-common/lib/rest";
import { sendError, sendOK } from "guzek-uk-common/lib/http";

export const router = express.Router();

const logger = getLogger(__filename);

enum CONTENT_LANGUAGES {
  EN = "contentEn",
  PL = "contentPl",
}

enum TITLE_LANGUAGES {
  EN = "titleEn",
  PL = "titlePl",
}

const send404 = (req: Request, res: Response) =>
  void sendError(res, 404, {
    message: `Could not find page with ID '${req.params.id}'.`,
  });

/** Ensures the `lang` query parameter or cookie of the request is provided and a valid language option.
 *  If so, returns the language enum value. If not, sends a 400 response and returns `null`. */
function validateRequestLanguage(req: Request, res: Response) {
  const reject = (message: string) => void sendError(res, 400, { message });
  const rawLang = req.query.lang || req.cookies.lang;
  if (!rawLang) {
    reject("No content language specified in request query or cookies.");
    return null;
  }
  if (typeof rawLang !== "string") {
    reject("Content language must be a string.");
    return null;
  }
  const lang = rawLang.toUpperCase();
  if (!(lang in CONTENT_LANGUAGES)) {
    reject(`Invalid content language: '${rawLang}'.`);
    return null;
  }
  return lang as keyof typeof CONTENT_LANGUAGES;
}

/** Consumes the request body, checking if the page content has been edited.
 *  If so, makes the appropriate changes in the `page` and `page_content` databases,
 *  and sends the response to the user.
 */
async function modifyPageContent(
  req: Request,
  res: Response,
  updateExistingPage: boolean
) {
  const { content, ...attributes } = req.body;
  const pageId = req.params.id;

  // Request validation
  const lang = validateRequestLanguage(req, res);
  if (!lang) return;

  if (content) {
    const newValues = { [CONTENT_LANGUAGES[lang]]: content };
    // Determine if the entry has to be created or modified
    const pageContent = await PageContent.findOne({ where: { pageId } });
    if (pageContent) {
      await pageContent.set(newValues).save();
    } else {
      if (!updateExistingPage && !attributes.shouldFetch) {
        return sendError(res, 400, {
          message:
            "Page content specified but 'shouldFetch' not set to 'true'.",
        });
      }
      await PageContent.create({ ...newValues, pageId });
    }
  }

  const localiseTitleProperty = () => {
    attributes[TITLE_LANGUAGES[lang]] = attributes.title;
    delete attributes.title;
  };

  if (updateExistingPage) {
    localiseTitleProperty();
    await updateDatabaseEntry(Page, req, res, attributes);
  } else {
    if (attributes.shouldFetch && !content) {
      return sendError(res, 400, {
        message: "'shouldFetch' set to 'true' but no page content specified.",
      });
    }
    attributes.titleEN = attributes.titlePL = "";
    localiseTitleProperty();
    await createDatabaseEntry(Page, req, res, attributes);
  }
}

router
  // CREATE new page
  .post("/", (req: Request, res: Response) =>
    modifyPageContent(req, res, false)
  )

  // READ all pages
  .get("/", (req: Request, res: Response) =>
    readAllDatabaseEntries(Page, res, async (pages) => {
      const lang = validateRequestLanguage(req, res);
      if (!lang) return;

      sendOK(
        res,
        pages.map((rawPage) => {
          const { titleEn, titlePl, ...page } = rawPage.get();
          return { ...page, title: lang === "EN" ? titleEn : titlePl };
        })
      );
    })
  )

  // READ specific page
  .get("/:id", async (req: Request, res: Response) => {
    const pageContent = await PageContent.findByPk(req.params.id);
    if (!pageContent) {
      return send404(req, res);
    }
    const lang = validateRequestLanguage(req, res);
    if (!lang) return;
    // const pages = await readDatabaseEntry(Page, res, { id: req.params.id });
    // if (!pages) return;
    // const page = pages.shift() as Page;
    // sendOK(res, { ...page.toJSON(), ...pageContent.toJSON() });
    sendOK(res, { content: pageContent.get(CONTENT_LANGUAGES[lang]) });
  })

  // UPDATE single page
  .put("/:id", (req: Request, res: Response) =>
    modifyPageContent(req, res, true)
  )

  // DELETE single page
  .delete("/:id", (req: Request, res: Response) =>
    deleteDatabaseEntry(Page, { id: req.params.id }, res)
  );
