// Piggles' own wording inside the shared surfaces.
//
// ── THIS FILE IS WRITING, NOT CONFIGURATION ─────────────────────────────────
//
// Every entry here is a sentence somebody wrote for a Piggles customer. None of
// them is the sparx sentence with the name changed, and none of them may become
// one — that shortcut is the thing this file exists instead of.
//
// The reason is not pedantry. The two products are written for two different
// people, and the difference shows up in the SHAPE of a sentence, not just its
// nouns:
//
//   sparx    "sparx uses this account to write and answer for you — it is the
//             AI service you already pay for."
//
//   Piggles  "This is your own AI account — the one you already pay for. We use
//             it to write and reply for you."
//
// Same fact. sparx leads with the system and names the mechanism; Piggles leads
// with the person, uses "you" and "we", and puts the reassurance in a short
// second sentence instead of a subordinate clause. A find-and-replace cannot
// produce the second from the first, which is why one was never attempted here.
//
// ── HOW TO WRITE ONE ────────────────────────────────────────────────────────
//
// piggles/CLAUDE.md RULE #3 is the contract; in practice, four habits:
//
//   • Say "you" and "we". sparx describes a system; Piggles talks to a person.
//   • No category words. Never CRM, CMS, module, credential, provider, endpoint.
//     The lexicon table in CLAUDE.md is the map — "app", not "module".
//   • Shorter sentences, and split a clause into its own sentence rather than
//     hanging it off a dash. Reassurance especially: it lands when it stands
//     alone.
//   • Playful, never childish, and never during money, tax, payroll or deletion.
//     Nothing in this file is a pig pun and nothing in it ever should be.
//
// ── WHAT NOT TO PUT HERE ────────────────────────────────────────────────────
//
// A string that merely CONTAINS the word "sparx" is not automatically an entry.
// Ask what the sentence is doing. If it names a sparx PRODUCT that Piggles does
// not have (sparx.market), the surface is hidden instead — see product.tsx. If
// it is a shared capability described in sparx's voice, it belongs here, written
// fresh.
//
// A key with no entry falls back to the surface's own sparx text, which is true
// but off-voice. That is the honest failure mode and it is why this file can be
// filled in over time without anything breaking — but an unfilled key is a
// Piggles customer reading sparx's words, so it is a debt, not a resting state.

export const PIGGLES_COPY: Readonly<Record<string, string>> = {
  // ── Your own AI ──────────────────────────────────────────────────────────
  //
  // The hardest thing this paragraph has to do is make somebody comfortable,
  // and sparx's version does it in a subordinate clause after a dash. Piggles
  // gives the reassurance its own sentence, because that is the sentence people
  // are actually looking for: who is paying, and can it act without me.
  'ai.account.description':
    'This is your own AI account — the one you already pay for. We use it to write and reply for you, and the cost goes to them, never to us. Without it connected, nothing here writes anything on your behalf.',

  // "Voice, rules and facts" is precise and slightly abstract; a shop owner
  // recognizes "how it should sound" faster than "voice". The example is doing
  // the real work, so it earns the length.
  'ai.instructions.pointer':
    'Tell it how you want it to sound and what it should always mention — your opening hours, how you like to sign off, the things you never want said.',

  // sparx's version says "Turn on the AI-assisted tools throughout sparx", which
  // is a feature description. The thing a business owner is deciding is whether
  // to let software write on their behalf, so that is what the sentence is about.
  'modules.ai.blurb':
    'Let Piggles help you write — product descriptions, replies, the words on your pages. It runs on an AI account you connect yourself, so you are never charged for it here.',

  // ── Automations ──────────────────────────────────────────────────────────
  //
  // "Set up by sparx" reads as provenance, which is a filing concept. "Ready to
  // use" is what the label is FOR: you did not build this and you do not have to.
  'automations.recipe.byPlatform': 'Ready to use',
  'automations.recipe.byPlatform.detail': 'One we built for you. Turn it on and it just runs.',

  // sparx names the modules ("Online store, Invoicing or Email"); Piggles names
  // its apps, and says what the automations DO rather than that they exist.
  'automations.recipes.firstRun':
    'These fill in as you start using more of Piggles. Turn on Sell, Invoices or Messages and the ready-made ones for each show up here — things like chasing a late invoice, or thanking someone for their first order.',
  'automations.recipes.noResults':
    'Try a different word, or set the filter back to “All recipes” to see the ready-made ones again.',

  // ── Money ────────────────────────────────────────────────────────────────
  //
  // "Your sparx bill" → what you pay us. Get Piggles is where the money a
  // customer pays WizeWorks lives, and naming it keeps the two kinds of money
  // apart (piggles/CLAUDE.md — the getpiggles/mypiggles split).
  'finance.bill.title': 'What you pay us',
  'finance.bill.addCard':
    'Opens Get Piggles in a new tab so you can add your card on their secure page. Got a discount code? You can enter it there too.',
  'finance.bill.portal':
    'Opens Get Piggles in a new tab, where you can change your card, change your plan, or download an old bill.',

  // ── Bookkeeping ──────────────────────────────────────────────────────────
  //
  // The disconnect warning is a money-and-deletion moment, so the voice goes
  // plain and calm — no lightness, and the consequence first.
  'finance.accounting.disconnect':
    'This signs you out and deletes the account codes you matched up, along with your books-closed date. Nothing already sent is taken back and none of your spending is deleted — but the setting up is gone, and you would have to do it again.',
  'finance.accounting.needsSignIn': 'Set up, but nothing can be sent until you sign in.',
  'finance.accounting.directSync':
    'Sent straight across means each cost is posted for you, instead of you moving a file yourself. Where that is not switched on yet, the download above already works with your bookkeeping today.',
  'finance.accounting.searchHint': 'does this work with Xero?',

  // ── Email ────────────────────────────────────────────────────────────────
  //
  // These three describe DNS records. sparx can say "SPF" and "tracking"; here
  // each one says what it lets you do, because the reader is following a setup
  // guide and needs to know what they are agreeing to, not what it is called.
  'email.domain.proven': 'This address is confirmed, so your email can be sent from it.',
  'email.domain.spf': 'Says we are allowed to send email for you.',
  'email.domain.tracking': 'Lets us tidy up your links and tell you who opened and clicked.',

  // ── A link to something switched off ─────────────────────────────────────
  //
  // sparx says "a part of sparx this business is not using yet". Piggles has no
  // module pricing, so "you only pay for the parts you use" is actively wrong
  // here — everything is included. The reason a Piggles app is off is that it
  // has not been added to the workspace yet, which is a different sentence.
  'link.unresolved.body':
    'This link opens an app you have not added yet. Everything is included in your plan, so you can turn it on whenever you like — nothing extra to pay.',
  'link.unresolved.action': 'See everything Piggles can do',

  // ── Apps ─────────────────────────────────────────────────────────────────
  'modules.builder.blurb':
    'Build your website — your pages, how they are laid out, and your own look. We host it for you.',
  // "Not payroll" has to survive, because getting that wrong costs someone real
  // money. It stays as its own short sentence for the same reason.
  'modules.staff.blurb':
    'Keep hours, pay rates, shifts, time off and license renewals, so you know what an hour of work really costs. This is not payroll — we hand the hours to whoever runs yours.',

  // ── Selling ──────────────────────────────────────────────────────────────
  'commerce.provider.retired':
    'This one is no longer available. Close this and pick another from the list.',

  // ── Your own AI, continued ───────────────────────────────────────────────
  //
  // "Add sparx to your AI app" reads as installing a plugin. What actually
  // happens is the other direction: their AI gets to see their business.
  'ai.mcp.title': 'Let your AI app see your business',
  'ai.instructions.summary':
    'How it should sound and what it should always say when it writes for you — including the personality of the chat on your site.',
  'ai.instructions.firstRun':
    'Write your first one. Tell it how to sound and what to say when it writes for you.',
  'ai.instructions.noneForViewer':
    'Nobody has written any of these yet, so it has nothing to go on. Ask whoever runs the account to add some.',

  // ── Customers ────────────────────────────────────────────────────────────
  //
  // These two are privacy promises, and the wording is the promise. Piggles
  // says "we" instead of naming the system, and puts the plain version first —
  // but nothing is softened or shortened, because a person deciding whether to
  // connect their own mailbox is entitled to the whole of it.
  'crm.mailbox.personal.privacy':
    'This is your own mailbox, so we keep only the messages to and from people already on your customer list. Everything else is thrown away as it is read — never saved, never searchable, never shown to your team.',
  'crm.mailbox.shared.privacy':
    'A shared address is there to receive mail from people you have not met, so we keep everything that arrives — including messages from strangers. Do not connect a personal mailbox this way.',
  'crm.objectType.key':
    'Used in web addresses, and by anything you connect to Piggles. It cannot be changed later.',
  'crm.objectType.customFields':
    'Anything else you want to keep about these that we do not already ask for.',
  'crm.phone.disabled':
    'Connecting a phone system is not switched on for this account yet. Whoever runs your account can turn it on.',
  'crm.phone.recording':
    'Calls are not recorded. We still note who was called, when, and for how long.',

  // ── Messages ─────────────────────────────────────────────────────────────
  'email.settings.fromAddress':
    'The address your email comes from. Leave it blank and we will send from our shared one.',
  // A do-not-email list is a legal boundary as much as a preference, so this
  // one stays firm and specific. "Only do this if you are sure" survives.
  'email.suppressions.remove':
    'Taking this address off your do-not-email list means we may email them again — newsletters, offers and account messages. Only do this if you are sure they want to hear from you.',
  'email.suppressions.firstRun':
    'When someone unsubscribes, or an address stops working, they land here on their own and we stop emailing them. You can add an address by hand too.',

  // ── Stock ────────────────────────────────────────────────────────────────
  'inventory.setup.title': 'Getting your stock in',
  'inventory.setup.detected': 'What we can already see',

  // ── Apps list ────────────────────────────────────────────────────────────
  //
  // "Available across sparx" is a platform statement. What the person wants to
  // know is that it is on and they can use it now.
  'modules.enabled.toast': 'It is on. You can start using it now.',
  'modules.noResults':
    'Try part of the name, or clear the search to see everything Piggles can do.',

  // ── Things waiting on you ────────────────────────────────────────────────
  'pulse.needsYou.description':
    'Anything waiting on you turns up here — a payment that failed, stock running low, a reply from us.',
  'pulse.needsYou.firstRun':
    'When we have something to tell you, it lands here and stays, so you can come back to it whenever you like.',

  // ── Your team ────────────────────────────────────────────────────────────
  //
  // "Parts of sparx" is the module vocabulary again. Piggles has apps.
  'team.member.access': 'Which apps they can open',

  // ── Partners ─────────────────────────────────────────────────────────────
  //
  // Piggles has a Partners app, so these are real. What is NOT real is sparx's
  // pricing model, which one of these described out loud.
  'partner.status.left': 'Left Piggles',
  'partner.perk.directory': 'A public listing in the Piggles partner directory',
  'partner.perk.bootcamps': 'Run public bootcamps on Piggles',
  'partner.tier.apply':
    'Apply once you have launched a few clients on Piggles and they are up and running.',
  'partner.bootcamp.signupMode': 'Sign up on Piggles (adds them to your customers)',
  'partner.bootcamp.publish':
    'It goes live on the public Piggles directory and starts taking sign-ups. You can cancel it later if plans change.',
  'partner.bootcamp.titleExample': 'Getting started with selling on Piggles',
  'partner.gate.title': 'This account is not a Piggles partner',
  'partner.pitch.platform':
    'Most businesses end up paying for a website builder, something to keep customer details in, an email tool, an invoicing app, and a pile of add-ons to make them talk to each other. Piggles is one place where all of that already lives together. Your site, your customers, your orders and your invoices — one login, one bill.',

  // THE ONE THAT WAS FACTUALLY WRONG, not merely off-voice. sparx's version says
  // pricing is "priced only on the modules they keep switched on" — that is
  // sparx's model. Piggles has ONE flat plan with everything in it and no module
  // pricing at all (piggles/CLAUDE.md RULE #2), so a partner repeating the sparx
  // sentence would be misselling. This is why brand copy cannot be a name swap:
  // the substituted sentence would have been grammatical, on-brand, and false.
  'partner.pitch.pricing':
    'Every Piggles account starts with a free trial — long enough to build the whole thing and see it working before paying anything. After that it is one flat monthly price with every app included. No tiers, and nothing to switch on later for more money.',

  // ── Things that "come with" the product ──────────────────────────────────
  //
  // sparx says "comes with sparx" / "set up by sparx" in half a dozen places to
  // mean "you did not make this and cannot break it". Piggles says it the way a
  // person would: it was already here, and it is yours to use.
  'crm.objectTypes.builtInBadge': 'Already here',
  'cms.contentTypes.builtIn':
    'These came with Piggles. You can see how they are put together, but they cannot be changed or removed.',
  'commerce.productTypes.builtIn':
    'These came with Piggles. Use one as it is, or edit it to keep your own version with the details you want.',
  'commerce.productType.forked':
    'You changed one that came with Piggles, so we saved it as your own copy. Your version only affects your business.',
  'automations.recipes.otherGroup': 'Other ones we set up for you.',
  'automations.field.ownHint':
    'Leave this as “one of my own” unless you are changing something that came with Piggles, like which stage a customer is at.',

  // ── Dashboards ───────────────────────────────────────────────────────────
  'analytics.dashboard.moduleOff': 'This one comes with an app you have not turned on yet.',
  'analytics.dashboards.firstRun':
    'These arrive as you turn on more apps — turn on My Site, for example, and you get one showing who is visiting.',

  // ── Chat ─────────────────────────────────────────────────────────────────
  'chat.assistant.description':
    'Answers new messages the moment they arrive, using your own AI account. It only ever runs on a key you connect below — without one, it never replies for you.',

  // ── Legal pages ──────────────────────────────────────────────────────────
  //
  // This is a legal boundary, so the "not legal advice" part is not softened and
  // not shortened. It gets its own sentence rather than a dash, which is the one
  // change worth making.
  'cms.legal.createHint':
    'This makes a private draft from a starter version, so you have something to work from instead of a blank page. It is a starting point, not legal advice. Read it through and make it fit your business before you publish. It will be linked in your site footer too.',
  'cms.legal.unreviewed':
    'This is still the starter wording. Read it through, make it fit your business, then mark it as checked.',

  // ── Selling elsewhere ────────────────────────────────────────────────────
  'commerce.channels.hint':
    'These shops are already set up here and can be connected in your settings.',

  // ── Calls ────────────────────────────────────────────────────────────────
  'crm.call.bridgeHint': 'Pick up and we will dial them and put you through.',
  'crm.phoneSystems.description':
    'Connect your phone account and a Call button appears on every customer. We ring you first, then dial them and put the two of you together — so the call is written down without anyone having to remember to do it.',
  'crm.templates.description':
    'A saved subject and message your team can pick when they email a customer, so the fourth follow-up this week reads as well as the first. We then count how many were sent, opened and answered — which is how you find out which of your own words work.',
  'crm.mailbox.zohoHint':
    'In Zoho Mail, open Settings → Security → App passwords and make one for us.',

  // ── Domains ──────────────────────────────────────────────────────────────
  'domains.boughtHere': 'Bought here',
  'domains.emptyUnexpected':
    'Every site comes with a free address, so this list should not be empty. Try reloading.',
  'onboarding.domain.pitch':
    'Your own web address makes people trust you — and it is yours to keep. Grab the one you want now, or start free on the address we give you and add your own whenever you like.',

  // ── Suppliers ────────────────────────────────────────────────────────────
  'dropship.supplier.keys':
    'The keys that let us talk to this supplier for you. They are stored safely and never shown again.',

  // ── Email, continued ─────────────────────────────────────────────────────
  'email.broadcast.scheduleHint':
    'Send it now, or pick a day and time and we will send it for you.',
  'email.suppression.bounced': 'Email to this address kept bouncing back, so we stopped trying.',

  // ── Getting set up ───────────────────────────────────────────────────────
  'industry.wordingOnly':
    'For now this only changes the wording. You have not turned on any of the matching apps yet, so there is nothing else to set up until you do.',
  'sampleData.scopeIntro': 'Loading some would fill in the apps you have turned on:',

  // ── Stock, continued ─────────────────────────────────────────────────────
  'inventory.barcodes.description':
    'A barcode lets someone scan a box instead of typing what is in it. Anything that arrived with a code from the maker can have it saved here, and anything without one can be given its own — we will print the labels.',
  'inventory.labels.needsBarcode':
    'Things need a barcode before a label can be printed. We can make one for anything that arrived without a code from the maker — a real barcode any scanner reads, from the range set aside for your own use.',
  'inventory.gl.ourFigure': 'What we make it',
  'inventory.reportSchedule.recipients':
    'One address per line, or separated by commas. They do not need an account here.',
  'inventory.sources.description':
    'Connect a stock source when the real count lives somewhere else — a spreadsheet you publish, another system, or something running on your own computers. Its numbers then come in and become what you sell against.',

  // ── What is happening ────────────────────────────────────────────────────
  'pulse.activity.description':
    'Everything you, your team and your customers have done, newest first.',
  'pulse.jobs.description': 'Work we are doing in the background for you.',

  // ── Your site ────────────────────────────────────────────────────────────
  //
  // The selling point is buried in sparx's version. The reason anyone cares
  // about first-party counting is the cookie banner they never have to show.
  'sites.analytics.firstParty':
    'We count visits ourselves, without cookies — so there is no banner for visitors to click through, and nothing for you to set up.',

  // ── Social ───────────────────────────────────────────────────────────────
  'social.metrics.pending':
    'Nothing back yet. Accounts report in their own time, usually within a few hours of a post going out, and we keep checking. Refresh numbers asks now.',
  'social.permissions.description':
    'Each platform decides what we are allowed to do with your account. This shows what they said yes to, against what posting, reading comments and reading your numbers actually need.',
  'social.inbox.description':
    'Comments on your posts, mentions and reviews land here, so you can answer them without going anywhere else.',

  // ── Your team, continued ─────────────────────────────────────────────────
  'staff.people.description':
    'Add the people who work for you and we can keep their hours, what those hours cost, and when their tickets and licenses run out.',
  'staff.certifications.description':
    'If your people need licenses, tickets or certificates, record them here and we will warn you before any of them run out — with as much notice as you ask for.',
  'team.roles.unknown':
    'A job title this version does not recognize. It still works, and you can ask us what it covers.',

  // ── Sentences with values in them ────────────────────────────────────────
  //
  // These come through productCopyWith, so a {placeholder} is filled in at
  // render. A placeholder that does not match is left visible on purpose — a
  // typo shows up as {nmae} in the sentence rather than silently eating a word.
  'link.unresolved.title': 'That app is not turned on',
  'link.unresolved.bodyNamed':
    'This link opens something in {name}, and you have not turned {name} on yet. Everything is included in your plan, so you can turn it on whenever you like.',
  'link.unknownAddress':
    'There is nothing at “{detail}”. The link may have been cut short on its way to you — they sometimes break traveling through a chat or an email — so it is worth asking for it again.',

  // THE SECOND FACTUALLY WRONG ONE. sparx ends this with "and you stop being
  // billed for it", because sparx charges per module. Piggles is one flat price
  // with every app included, so turning an app off saves nobody anything and
  // saying otherwise would be a false promise at the exact moment somebody is
  // deciding. The rest of the reassurance matters more here, not less.
  'modules.turnOff.confirm':
    '{name} stops working straight away — it leaves your sidebar and everything in it switches off. Nothing you have already made is deleted; it is just hidden until you turn {name} back on. Your bill does not change either way.',

  'automations.recipe.alwaysOn':
    '{title} is always on. We look after this one, so it cannot be turned off.',
  'email.suppression.added': 'We will not email {address} again',
  'email.domain.removeDefault':
    'This is the address this site sends from. Remove it and your email falls back to a shared address until you set another one. Anything already sent is unaffected. This cannot be undone.',
  'inventory.gl.description':
    'As at {asOf}. Each line either raises what your books should show, or lowers it, to match what we make it.',
  'inventory.import.newCodes':
    '{rows} we have never seen before. Add them as new items, or leave them out — either way, what you decide is recorded with the import.',
  'migration.helpSubject': 'I cannot connect Piggles to {vendor}',
  'sampleData.loadConfirm':
    'This fills {scope} with a full, realistic {pack} set — products, customers, orders and more — so you can see how everything works with records that look real. It is all clearly marked as samples and can be removed in one go.',
  'sampleData.packSummary':
    'A {pack} set, built to show everything working with records that look real.',
  // The blank line matters: this is a FILE somebody opens months later, and
  // without it the heading ran straight into the first code
  // ("Piggles backup codes2oriZ-EU7fh"), which is a code you cannot read.
  'security.backupCodes.file': 'Piggles backup codes\n\n{codes}\n',

  'partner.gate.description':
    '{section} is part of the partner program, for agencies and consultants who bring clients to Piggles. An owner or admin can apply from your account settings, and once we approve it this fills in.',
  'partner.tier.applyConfirm':
    '{commission}. We review applications, usually within a few working days — nothing about your account changes until it is approved.',

  // ── Who is speaking ──────────────────────────────────────────────────────
  'feedback.staffByline': '{author} · Piggles',

  // ── The address your customers see ───────────────────────────────────────
  //
  // NOT copy — a real address that lands in a recipient's inbox. It is here
  // because the fallback is sparx's sending domain, and a Piggles customer's
  // newsletter must not arrive from sparx.email. THIS VALUE NEEDS A REAL
  // PIGGLES SENDING DOMAIN BEHIND IT before anything relies on it; until the
  // DNS exists, mail from this address will not deliver. Flagged rather than
  // invented, because a plausible-looking address that bounces is worse than
  // the leak it replaces.
  'email.sender.fallbackAddress': 'noreply@piggles.email',

  // ── Getting paid ─────────────────────────────────────────────────────────
  //
  // sparx's version recommends sparx Pay as the fastest way to start. Piggles
  // has no first-party gateway, so the sentence loses its recommendation rather
  // than pointing at a row that is no longer in the list.
  'commerce.payments.chooseIntro':
    'Choose who takes your customers’ payments. Open any of these to set it up — you will need an account with them, and most take a few minutes.',

  // ══ THE SECOND SWEEP ══════════════════════════════════════════════════════
  //
  // The first pass covered the sentences a codemod could find: quoted strings
  // and template literals in shared surfaces. It missed a hundred more because
  // they are JSX PROSE — words sitting between tags across two or three lines,
  // which no string scan sees. Everything below that boundary was found by
  // scanning the rendered text rather than the source.
  //
  // Same rule as above: written, never substituted.

  // ── The product as a NAME ────────────────────────────────────────────────
  //
  // A few of these are not sentences at all — they are the product's name in a
  // noun slot, as the ACTOR of something automatic: "who moved this stock",
  // "who signed in". Those go through `productName()` at the call site rather
  // than through here, because there is no sentence to write. This one has a
  // comma and an adverb in it, so it is a sentence.
  'inventory.provenance.platform': 'Piggles, on its own',

  // ── Things that came with the software ───────────────────────────────────
  //
  // sparx says "ships with sparx" / "comes with sparx", which is release
  // language — it tells you how the thing got here rather than what it means
  // for you. What it means is: this one is not yours to change, and you did not
  // have to build it.
  'crm.report.builtIn': 'Ready-made',
  'crm.objectType.builtIn': 'Ready-made',
  'automations.badge.system': 'Set up for you',
  // Deliberately different from the one above. "Managed" is the one that
  // changes what a person can DO — it cannot be edited or turned off — so it
  // says so rather than sounding like a provenance note.
  'automations.badge.managed': 'Looked after for you',

  // ── AI ───────────────────────────────────────────────────────────────────
  //
  // The whole of this area rests on one fact that has to survive every rewrite:
  // Piggles never runs AI on its own account. It writes using YOUR provider
  // account, billed to you, and it does nothing at all until you connect one.
  'ai.prompt.deleteConfirm':
    'Piggles will stop following this instruction when it writes for you. You cannot undo this, but you can always write it again.',
  'ai.prompt.active': 'Piggles follows this whenever it writes using your AI account.',

  // ── Email ────────────────────────────────────────────────────────────────
  'email.settings.sharedAddress': 'The shared Piggles address',
  'email.domain.verified': 'Piggles can send your email from this address now.',

  // ── Customers ────────────────────────────────────────────────────────────
  'crm.mailbox.disconnect':
    'Piggles stops reading new email from this mailbox and stops sending through it. Every conversation already on a customer’s record stays — disconnecting a mailbox has never deleted anybody’s history.',
  'crm.phone.disconnect':
    'Piggles stops making calls through this account. Every call already logged on a customer’s record stays — disconnecting has never deleted your call history.',

  // ── Money ────────────────────────────────────────────────────────────────
  //
  // NOT `finance.accounting.disconnect`, which is already taken by the
  // DESTRUCTIVE confirm further up — the one that also deletes your account
  // codes. This is the gentle one: sign out, keep everything. Two confirms that
  // differ on whether work is lost must never share a key.
  'finance.accounting.signOut':
    'Piggles forgets the sign-in and stops sending anything on its own. Your account codes, your books-closed date and everything already sent stay exactly as they are — sign in again whenever you like and nothing needs doing twice.',
  // Marketplace and gateway names that belong to the other brand. A Piggles
  // business can never have a payout from either, so these only ever appear as
  // an empty filter option — and an option naming another company's product is
  // a question with no answer.
  'finance.payoutSource.sparxPay': 'Another payment service',
  'finance.channel.sparxMarket': 'Another marketplace',

  // ── Moving in ────────────────────────────────────────────────────────────
  'migration.helpSubject.export': 'Piggles could not read my export file',

  // ── Social ───────────────────────────────────────────────────────────────
  //
  // The honest version of a beta notice: what is actually rough, and the one
  // reassurance that matters. sparx's is a list of four symptoms; Piggles says
  // the same thing shorter, because a person reading this is already worried.
  'social.beta.notice':
    'The social networks are still reviewing our access to post on your behalf, so this part is bumpy for now — an account may refuse to connect, a post can sit waiting longer than you would expect, and the numbers can be slow to catch up. Nothing you write is ever lost.',

  // ── Your own AI, continued ───────────────────────────────────────────────
  //
  // Two of these lost a REFERENCE as well as a voice. sparx says "turn on the
  // AI part of sparx under Modules" — a screen the Piggles console hides,
  // because it prices per module and Piggles does not. The Piggles sentence
  // points at the door that exists: All apps, in the rail.
  'ai.moduleOff.connected':
    'Your account is connected, but nothing will use it until you add the AI app. It is in All apps, at the bottom of the menu down the side.',
  'ai.moduleOff.notConnected':
    'You can connect your account now, but nothing will use it until you add the AI app — it is in All apps, at the bottom of the menu down the side.',
  'ai.mcp.empty':
    'Nothing is connected yet. Open your AI app, add Piggles using the address above, and say yes when it asks for access. It will show up here straight after.',
  'ai.prompt.newIntro':
    'Tell Piggles something about your business to use when it writes for you — how you like to sound, what to always mention, what never to say. You can switch any of it off later.',
  'ai.prompt.readOnly':
    'You can read this, but changing how Piggles writes needs an owner or an admin.',
  'ai.prompts.intro':
    'The things Piggles keeps in mind whenever it writes for you — your tone, the details you always want in, the words you never want used, right down to how the chat on your site sounds. Only the ones switched on are followed.',
  'ai.tools.notWriting':
    'This is about an outside app reaching into your business and doing things. It is not the writing help Piggles gives you — that lives in',
  // The three fragments of one sentence. The emphasis is the argument: one AI
  // works FOR you, the other reaches INTO your business, and they point in
  // opposite directions. Keep the shape or the bold stops meaning anything.
  'ai.connections.introA':
    'Two different things live on this screen. Above is the AI account Piggles uses to write and reply',
  'ai.connections.forYou': 'for you',
  'ai.connections.introB': '. Below are the outside AI apps you allow to reach',
  'ai.connections.intoBusiness': 'into your business',
  'ai.connections.introC':
    'and change things. They point opposite ways, which is exactly why they are kept apart.',

  // ── Automations ──────────────────────────────────────────────────────────
  'automations.managed.body':
    'We look after this one, so it cannot be edited here. Use “Duplicate to edit” to get your own copy — change it however you like, and this one carries on running untouched.',
  'automations.recipes.intro':
    'These are already set up and waiting. Each one quietly does a job for you — welcoming a new customer, chasing an invoice that is late, following up after a sale. Switch one on and it starts; use “Customize” to change how it behaves.',
  'automations.goal.explain':
    'Say what you actually want to happen. When it happens for somebody, Piggles stops the rest of the steps for them — no point nudging a person who has already done it — and counts them as a win.',
  'automations.noGoal':
    'This has run {runs} times. Whether any of that got you what you wanted is not something we can work out on our own — tell us what you were aiming for and this turns into a real number.',

  // ── My Site ──────────────────────────────────────────────────────────────
  'builder.pages.otherViews':
    'Another {count} visits landed on addresses that are not pages you made: your checkout, the account area where customers look at their own orders, and any address that no longer has a page on it. They count towards your visitor numbers but have no row above.',

  // ── Content and products that came ready-made ────────────────────────────
  'cms.contentType.builtIn':
    'This one is ready-made and shared by every business, so its fields are fixed. You can still write as much of this kind of content as you like.',
  'commerce.productType.builtIn':
    'This one is ready-made and shared by every business. Use it as it is, or change it here — the first time you do, you get your own copy and it only ever affects you.',

  // ── Customers ────────────────────────────────────────────────────────────
  'crm.mailbox.testSignIn': 'We sign in once now, just to be sure it works.',
  'crm.mailbox.connectIntro':
    'New email to this address shows up on the matching customer’s record, and your replies go out from it.',
  'crm.mailbox.checkNote':
    'We look for new email every few minutes. The refresh button on a row checks that one right now, if you cannot wait.',
  'crm.phone.connectIntro':
    'We ring your phone first. You pick up, and it dials the customer and puts you together — so the call happens on a real handset with a real signal, and who you called, when and for how long is written down without you doing anything.',
  'crm.phone.ownAccount':
    'It is your phone account, so calls are billed to you at your rates and the number stays yours. We lock the token away and never show it again.',
  'crm.phone.tokenNote':
    'To change the token on a number, disconnect it and connect it again. We never show a token back, so there is nothing to edit in place.',
  'crm.call.ringsFirst': 'We ring this phone first, then dial them and put you together.',
  'crm.report.readOnly':
    'This is one of the ready-made reports. Make a copy to change anything — the copy is yours entirely.',

  // ── Your web address ─────────────────────────────────────────────────────
  //
  // FACTUALLY WRONG under Piggles, not merely off-voice. sparx tells the reader
  // their free address is a "sparx.zone address"; a Piggles business is given
  // <something>.piggles.site at signup, so the sparx sentence names a domain
  // they do not have and will never see.
  'domains.managedAddress':
    'We look after this address, so there is nothing for you to set up and nothing that can break. Every site gets one free, it works from the minute you sign up, and it keeps working even after you connect your own domain — it can never be removed, because it is your site’s permanent back-up address.',

  // ── Messages ─────────────────────────────────────────────────────────────
  'email.suppression.addNote':
    'We will stop sending this address anything at all — newsletters, offers, account emails, the lot. You can take them off this list whenever you like.',
  'email.domain.addIntro':
    'Use a domain you own and your email goes out from your own address — hello@yourbakery.com rather than a shared one. Once you add it we give you a few records to paste in wherever you bought the domain, to prove it is yours.',

  // ── Money ────────────────────────────────────────────────────────────────
  'finance.accounting.mapCta': 'Tell us your accountant’s codes',
  'finance.accounting.notLedger': 'Piggles is not your accounting package',
  'finance.profit.footnote':
    'These are rebuilt every night, and whenever you press Rebuild. This is your working picture of the business — your accountant’s books are still the record.',

  // ── What kind of business you are ────────────────────────────────────────
  'industry.intro':
    'Tell us your trade and we change the wording you see and give you a head start built for it — example categories, sensible settings, a bit of content to work from. You can change it later, and choosing one never removes anything you have already made.',
  'industry.confirm.first':
    'This changes the wording to suit {name}, and gives the apps you have added a tailored head start{apps}. It only fills in the empty spaces — nothing you have already made is touched.',
  'industry.confirm.reapply':
    'This tops up the head start in the apps you have added{apps}. It only fills in the empty spaces — nothing you have already made is touched.',
  'industry.willSetUp':
    'We will set up {trade} defaults across {apps}. Everything we add is new — your own work is left exactly where it is.',

  // ── Stock ────────────────────────────────────────────────────────────────
  'inventory.bin.systemShelf':
    'This shelf came with your setup. Rename it and put it wherever you like in the picking order — its kind is fixed, because other things go looking for it.',
  'inventory.gl.intro':
    'What we think your stock is worth, next to what your accounts say, with every ordinary reason the two differ named and priced.',
  'inventory.gl.askTitle': 'Tell us what your books say',
  'inventory.gl.askBody':
    'We do not keep your ledger, so we cannot know what your stock account holds. Put the balance in below — off your trial balance, or from whoever keeps the books — and we will work out the difference and explain it. Until then there is nothing to compare against, which is why it is blank rather than zero.',
  'inventory.gl.reconciles':
    'Once the timing differences below are allowed for, we agree with your books exactly. This is the answer you want when your accountant asks.',
  'inventory.integrity.noSources':
    'You are not pulling stock in from anywhere else, so every number here was recorded right here.',
  'inventory.provenance.internalOnly': 'This number is kept here — nothing outside is feeding it.',
  'inventory.performance.unattributed':
    '{units} sold somewhere we never saw the order, so those sales are missing from the figures below.',
  'inventory.source.addIntro':
    'Connect something outside Piggles that keeps its own count — a spreadsheet, another system. Its numbers come in and become the stock you sell against.',
  'inventory.import.needsColumn': 'What we need',
  'inventory.import.ignored': 'Columns we have no use for and will skip:',
  'inventory.import.autoRecipe': 'Let us work it out',
  'inventory.import.recipeNote':
    'This only widens the list of headings we recognize. It never changes what the import actually does.',
  'inventory.barcode.none':
    'Nothing scans as {item} yet, so somebody has to find it by name every time. We can make a real barcode for it — any scanner reads it, and it can never clash with a manufacturer’s.',

  // ── Invoices ─────────────────────────────────────────────────────────────
  'invoicing.stage.internalName':
    'Only ever seen by you and your team. Usually the same as above — make it different when your word for the step is not the one you would say to a customer.',

  // ── The console itself ───────────────────────────────────────────────────
  'notifications.intro':
    'Choose what we tell you about, and whether it comes by email or just waits for you here. These are your own choices — nobody else on your team is affected.',
  'sampleData.nothingOn':
    'You have not added any of the apps this would fill, so a load would only add a little. Add something like Sell or Bookings first and you will get the full set.',

  // ── Signing in ───────────────────────────────────────────────────────────
  'security.twoFactor.needApp':
    'You will need a free authenticator app on your phone — Google Authenticator, Microsoft Authenticator and 1Password all work. It shows a 6-digit code that changes every 30 seconds, and we ask for that code when you sign in.',
  'security.twoFactor.verifyStep':
    'Last step: type the 6-digit code your app is showing for Piggles right now. Nothing changes until this works, so a code that will not go through costs you nothing.',

  // ── Get Found ────────────────────────────────────────────────────────────
  'social.evergreen.explain':
    'Mark the posts you are happy to run again. When a posting slot comes round with nothing planned, we can fill it from these — and you still say yes before anything goes out.',

  // ── My Team ──────────────────────────────────────────────────────────────
  //
  // Money, employment and payroll: plain and calm, no lightness anywhere near
  // them (piggles/CLAUDE.md RULE #3).
  'staff.certs.empty':
    'Nothing recorded yet. If this person needs a license, ticket or certificate to do their job, add it here and we will warn you before it runs out.',
  'staff.employmentType.note':
    'This is for your own cost reporting. It does not decide anyone’s employment status and nothing is filed on the strength of it.',
  'staff.payroll.sectionNote':
    'We record the hours and the rates. Whoever runs your payroll gets the file.',
  'staff.notPayroll':
    'Piggles is not a payroll system. It records what people worked and what that cost. It does not withhold tax, file returns, or pay anybody.',
  'staff.payrollExport':
    'We do not run payroll and we are not going to. What we can do is hand whoever does a file of this period’s approved hours per person, with their payroll id on it, so nobody is matching names in a spreadsheet.',
  'team.member.nothingOn':
    'You have not added any apps yet, so there is nothing to choose between. Add one and it will appear here.',

  // ── Waiting ──────────────────────────────────────────────────────────────
  //
  // The most-read two words in the whole product: every pane shows this on its
  // first load. "Loading…" is what software says about itself; this is what a
  // person waiting would rather hear, and it stays bearable on the thousandth
  // reading, which is the only test that matters for a string this common.
  'pane.waiting': 'Just a moment…',
  'inline.waiting': 'Just a moment…',
};
