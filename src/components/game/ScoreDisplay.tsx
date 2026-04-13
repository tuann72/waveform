interface ScoreDisplayProps {
  totalScore: number
  roundNumber: number
  totalRounds: number
}

export function ScoreDisplay({ totalScore, roundNumber, totalRounds }: ScoreDisplayProps) {
  return (
    <div className="flex items-center justify-between w-full text-sm text-muted-foreground">
      <span>Round {roundNumber} / {totalRounds}</span>
      <span className="font-medium text-foreground">{totalScore} pts</span>
    </div>
  )
}
