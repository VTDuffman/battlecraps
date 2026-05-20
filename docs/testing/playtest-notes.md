Testing Date: 05/13/2026

Observations:

1. Lefty McGuffin and the Whale were unlocked in a winning run, but the "cinematic" modal didn't appear in that run when unlocked. Instead, they both triggered in the next run after the winning run, after visiting the pub for the first time in the new run.
2. Old Pro didn't show the unlock cinematic modal either, that should pop after winning the final marker for the first time but before the game over screen.
    - The first winning run with the Old Pro unlock should go: 1. Beat Marker 2. Cinematic Unlock for Old Pro Modal 3. Unlock Recap Summary Screen 4. Game Over Summary Screen
3. It looks like there's some words that are hidden behind the dice after they reset, they're kind of small. Not sure if we need to bring those to the front, or elminate entirely.
4. I don't think the Handicapper's crew power is firing at all.
5. Whether or not a Marker is hit should be evaluated when the bankroll changes, currently it looks like it's evaluated on every roll and that seems kind of silly. If you have more in your bankroll than the marker, you should win the marker with no additional rolls necessary.
6. We used to round to the nearest dollar, and now I'm seeing cents again and don't know why. I think it was when the foreman's 20% boss power was implemented. Even with percentages, we should always round to the closest dollar.
7. I couldn't tell if the Foreman was actually taking his cut. I think he was, but we should include information like that in the roll log. When money is won or lost, the total net value should be displayed with all additives, multipliers, and subtractions.
8. The Emoji for the Comp Cards is off by 1, "The Vig" shows the helment when you win it on the "deal in"screen, the members jacket shows the anchor, etc.
9. The "Comps" in the top right don't account for The Vig at all. When you win the vig, on the next floor (VFW) it shows you have the members jacket, we must have missed that in implementing the new floor
10. Whatever is calculating the cost for Lefty, Old Pro, Whale, and Mechanic has made it so they are completely unattainable. Every time I got them in the pub, their cost was double my bankroll. For example, the whale was $2500 after marker 6 and I only had around $1200 in my bankroll at the time.
11. All the tooltip descriptions for the flat payout crew are incorrect now post adjustment. They should account for the scaling we implemented.
    - Ideally, it should dynamically calculate and display whatever the actual payout is for that marker (As opposed to a percentage)
12. On the Riverboat "Floor Intro" Page, Mme. Le Prix's description is wrong, it talks about "Reversing the Order" but she makes the crew not work. 

Testing Date: 05/19/2026

Observations:

1. The comp cards should have a tooltip when hovered over in "Expanded" mode that tells the user what the comp does.
2. "Call The Pit Boss" button under the marker that forces a check to see if the marker has cleared or not. This should have a modal window or something with the pit boss's decsion.
3. It looks like I unlocked the mimic on marker 11, which made it available in the following pub. I hired them, and then on Marker 12 (mme. Le Prix boss level) the "Cinematic Unlock" fired, creating a confusing user experience.
4. The Text on Floor 5 The Lodge Intro fades and is hard to read. This seems to applies to all floors. Also the "Floor x" at the top is hard to read. all of the text on the floor intro screens should be brighter.
5. It looks like mimic only copies the crew member to their immediate left, not the "last one that fired."
6. It doesn't look like "The Golden Touch" is working. It says the first come out roll of every shooter should be a natural.
7. It doesn't look like "Members Jacket is working. I see the empty shooter pip under the hype marker, but I just started the marker and should have all 6 shooters. I don't know if I only have 5 shooters or if it's just not displaying properly.
6. It doesn't look like the "High Tide/Low Tide" Mechanic that we implemented for THE SOVERIEGN boss fight is working. The display is still showing the old "Tide, surge in ..." indicator. I haven't been able to thrououghly test this yet, I usually only get one roll.
7. The pub screen of THE INTERFACE before THE NULL POINT floor is still showing thematically the Greyscale, which ruins the suprise of the NULL POINT immediately after. It should just be styled like the other THE INTERFACE screens on the THE SIGNAL Level.

