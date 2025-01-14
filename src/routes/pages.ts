import express from "express";
import type { Request, Response } from "express";
import { getLogger } from "guzek-uk-common/logger";
import { Page, PageContent } from "guzek-uk-common/sequelize";
import {
  createDatabaseEntry,
  deleteDatabaseEntry,
  readAllDatabaseEntries,
  sendError,
  sendOK,
  updateDatabaseEntry,
} from "guzek-uk-common/util";

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

/** Ensures the `lang` query parameter of the request is provided and a valid language option.
 *  If so, returns the parameter value. If not, sends a 400 response. and returns `undefined`. */
function validateLangParameter(req: Request, res: Response) {
  const reject = (message: string) => void sendError(res, 400, { message });
  if (!req.query.lang) {
    return reject("No content language specified in request query.");
  }
  const lang = req.query.lang.toString().toUpperCase();
  if (!(lang in CONTENT_LANGUAGES)) {
    return reject(`Invalid content language: '${req.query.lang}'.`);
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
  const lang = validateLangParameter(req, res);
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
      const lang = validateLangParameter(req, res);
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
    const lang = validateLangParameter(req, res);
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
