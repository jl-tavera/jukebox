import type { ErrorCode } from '@jukebox/schema'

/**
 * Codes the CLI raises on its own behalf, where the API's five say what the
 * server could not do.
 *
 * Nine now. Each arrived with the thing that raises it, and the latest is
 * `playlist_ambiguous`, which arrived with the change that let `show` and
 * `remove` accept a name -- so it arrived with the first reference a person can
 * give that fairly describes two Playlists. The rule the file set down -- no
 * code before something raises it -- is kept the way it was kept for the other
 * eight: the code raising it ships in the same commit as the code, and is
 * exercised at the seam its commands are exercised at.
 */
export type ClientErrorCode =
  /** The argument vector names no command, or one that does not exist. */
  | 'invalid_usage'
  /** Something failed that nothing planned for. Always a bug here. */
  | 'unexpected'
  /**
   * This binary predates the oldest one the backend will serve. A hard stop and
   * never a warning: a client that predates a breaking contract change cannot
   * proceed safely, and a result it half-understood is worse than no result.
   */
  | 'version_unsupported'
  /**
   * The backend says it is not serving. The document's `message` is printed
   * verbatim beside this, which is what lets the copy improve without a client
   * release.
   *
   * Named for the word the document's own `status` uses rather than after the
   * API's `source_unavailable`, which is about a Playlist's Source and not
   * about us. Two codes a word apart is a branch waiting to be got wrong.
   */
  | 'service_down'
  /**
   * A request the CLI needed an answer to never got one.
   *
   * Two things raise it, and they are the same thing from a caller's side. The
   * discovery document could not be read and there was no saved copy to fall
   * back on -- only when both are true, because a fetch that failed with a saved
   * copy behind it is a warning and a working run. Or the API itself could not
   * be reached, which no saved copy substitutes for: the Mirror can be read
   * offline, but nothing can add a Playlist without asking.
   */
  | 'network_unreachable'
  /**
   * The Mirror could not be opened, or could not be brought up to date.
   *
   * Its own code rather than `unexpected`, because it is not a bug here and the
   * reader's next move is specific: a disk that is full, a directory that is not
   * writable, a file another Jukebox is holding, or a record written by a newer
   * release than this one. Unlike the discovery cache, a failure here is never
   * swallowed -- that cache is discardable by construction and this is the
   * command.
   */
  | 'mirror_unopenable'
  /**
   * The Mirror holds no Playlist by the name it was given.
   *
   * Its own code rather than the API's `playlist_not_found`, which the contract
   * defines as the server saying it holds no row. `show` and `remove` never ask
   * the server anything, so borrowing that code would tell a script the network
   * was consulted and the backend disagreed -- when what happened is that this
   * machine was asked about something it has never tracked. The two can even
   * disagree honestly: a Playlist a stranger added is tracked upstream and in no
   * Mirror but theirs.
   *
   * Not `invalid_usage` either. The argument vector was fine; what it named is
   * simply not here, which is a thing a script may want to branch on rather than
   * a thing it got wrong.
   */
  | 'playlist_not_tracked'
  /**
   * The name given matches more than one Playlist this machine tracks.
   *
   * New with the change that made a name something `show` and `remove` accept.
   * Until then the only handles were the id and the URL, and neither can
   * name two rows -- a Source lets two Playlists share a title, so this is the
   * first reference a person can give that is a fair description of two things.
   *
   * Not `playlist_not_tracked`, which says the Mirror holds no such Playlist
   * when the truth is that it holds two. And not `invalid_usage` either, which
   * is the line the code above draws from the other side: the argument vector
   * was fine and what it named is real, there is simply more than one of it.
   *
   * Its own code rather than a sentence, because a script removing Playlists in
   * a loop has to branch on this -- the alternative is parsing English to find
   * out whether to try again with an id.
   */
  | 'playlist_ambiguous'
  /**
   * The configuration file was not written.
   *
   * Its own code rather than `unexpected`, which says of itself that it is always
   * a bug here: a read-only home, a full disk, and a rename Windows refuses
   * because another process holds the file are none of them bugs in this binary.
   * `mirror_unopenable` is the precedent, and its sentence applies word for word
   * -- unlike the discovery cache, a failure here is never swallowed, because
   * that cache writes for the next run and this is what the user just asked for.
   *
   * One code for three causes, deliberately. A write the filesystem refused; a
   * write Jukebox refused because the file already there will not parse and
   * rewriting it would throw away whatever else is in it; and a value the writer
   * could not spell back exactly, which its own postcondition catches before
   * anything reaches the disk. Three sentences to read and one fact to branch on:
   * the setting is not in the file. The message says which, and no caller would
   * do anything different with three codes.
   *
   * A vector naming no key, an unknown key, or a value that will not parse stays
   * `invalid_usage`. That is the line `playlist_not_tracked` draws from the other
   * side: a Playlist this machine does not track is a real thing that is absent,
   * and a setting called `libary_path` is not a thing that could exist.
   */
  | 'config_unwritable'

/**
 * One vocabulary, in one place.
 *
 * The API's half is imported rather than restated, which is the coupling this
 * repo wants: a code added to `openapi.yaml` widens what the CLI can branch on
 * without anyone remembering to copy it, and a code renamed there breaks this
 * typecheck until it is handled.
 */
export type JukeboxErrorCode = ErrorCode | ClientErrorCode
