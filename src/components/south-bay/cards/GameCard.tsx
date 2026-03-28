import type { ParsedGame } from "../../../lib/south-bay/types";

interface Props {
  game: ParsedGame;
}

export default function GameCard({ game }: Props) {
  const isLive = game.status === "in";
  const isFinal = game.status === "post";
  const isPre = game.status === "pre";

  // Determine winner for final games
  const homeWins =
    isFinal &&
    game.homeScore !== undefined &&
    game.awayScore !== undefined &&
    game.homeScore > game.awayScore;
  const awayWins =
    isFinal &&
    game.homeScore !== undefined &&
    game.awayScore !== undefined &&
    game.awayScore > game.homeScore;

  return (
    <div className={`sb-game-card${isLive ? " sb-game-card--live" : ""}`}>
      {/* Status row */}
      <div className="sb-game-status">
        <div className="sb-game-time">
          {isLive ? (
            <span className="sb-live-badge">
              <span className="sb-live-dot" />
              {game.statusDetail}
            </span>
          ) : isFinal ? (
            <span>{game.statusDetail}</span>
          ) : (
            <span>{formatTime(game.startTime)}</span>
          )}
        </div>
        {game.broadcasts.length > 0 && (
          <span className="sb-broadcast">{game.broadcasts.join(", ")}</span>
        )}
      </div>

      {/* Teams */}
      <div className="sb-game-teams">
        <TeamRow
          name={game.awayTeam}
          abbr={game.awayAbbr}
          logo={game.awayLogo}
          record={game.awayRecord}
          score={game.awayScore}
          isWinner={awayWins}
          isLoser={homeWins}
          isSouthBay={!game.isSouthBayHome}
          southBayKey={game.southBayTeamKey}
          showScore={!isPre}
          color={game.awayColor}
        />
        <TeamRow
          name={game.homeTeam}
          abbr={game.homeAbbr}
          logo={game.homeLogo}
          record={game.homeRecord}
          score={game.homeScore}
          isWinner={homeWins}
          isLoser={awayWins}
          isSouthBay={game.isSouthBayHome}
          southBayKey={game.southBayTeamKey}
          showScore={!isPre}
          color={game.homeColor}
        />
      </div>
    </div>
  );
}

interface TeamRowProps {
  name: string;
  abbr: string;
  logo?: string;
  record?: string;
  score?: number;
  isWinner: boolean;
  isLoser: boolean;
  isSouthBay: boolean;
  southBayKey: string;
  showScore: boolean;
  color: string;
}

function TeamRow({
  name,
  logo,
  record,
  score,
  isWinner,
  isLoser,
  isSouthBay,
  southBayKey,
  showScore,
  color,
}: TeamRowProps) {
  // Only highlight as south bay if this row IS the south bay team
  const isSBTeam =
    isSouthBay &&
    southBayKey !== "";

  return (
    <div className="sb-team-row">
      {logo ? (
        <img className="sb-team-logo" src={logo} alt="" loading="lazy" />
      ) : (
        <div
          className="sb-team-logo"
          style={{
            background: color,
            borderRadius: 4,
          }}
        />
      )}
      <div className={`sb-team-name${isSBTeam ? " sb-team-name--south-bay" : ""}`}>
        {name}
        {record && <span className="sb-team-record">({record})</span>}
      </div>
      {showScore && score !== undefined && (
        <div
          className={`sb-team-score${
            isWinner ? " sb-team-score--winner" : isLoser ? " sb-team-score--loser" : ""
          }`}
        >
          {score}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
    });
  } catch {
    return "";
  }
}
