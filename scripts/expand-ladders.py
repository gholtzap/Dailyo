"""Append solvable ladders between familiar endpoints already used in the game."""
import collections
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'dist/games/data/ladderrot.json'
rows = json.loads(path.read_text())[:129]
words = json.loads((root / 'dist/games/data/ladder-words.json').read_text())
buckets = collections.defaultdict(list)
for word in words:
    for i in range(4):
        buckets[word[:i] + '*' + word[i+1:]].append(word)
endpoints = sorted({word for pair in rows[:129] for word in pair})
seen = {tuple(sorted(pair)) for pair in rows}
added = []
for start in endpoints:
    distances = {start: 0}
    queue = collections.deque([start])
    while queue:
        word = queue.popleft()
        for i in range(4):
            for neighbor in buckets[word[:i] + '*' + word[i+1:]]:
                if neighbor not in distances:
                    distances[neighbor] = distances[word] + 1
                    queue.append(neighbor)
    for goal in endpoints:
        if start < goal and (start, goal) not in seen and 3 <= distances.get(goal, 0) <= 6:
            added.append([start, goal])
# Spread the deck across starting words rather than exhausting one word first.
added.sort(key=lambda pair: (sum(ord(c) * (i+1) for i,c in enumerate(''.join(pair))) % 997, pair))
rows += added[:871]
path.write_text(json.dumps(rows, indent=2) + '\n')
print(f'{len(rows)} ladders')
