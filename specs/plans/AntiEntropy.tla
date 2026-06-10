----------------------------- MODULE AntiEntropy -----------------------------
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS Replicas, Events, Origin, EventSeq

ASSUME Replicas # {}
ASSUME Events # {}
ASSUME Origin \in [Events -> Replicas]
ASSUME EventSeq \in [Events -> Nat]

VARIABLES known, network

Message == [
  from: Replicas,
  to: Replicas,
  events: SUBSET Events
]

TypeOK ==
  /\ known \in [Replicas -> SUBSET Events]
  /\ network \in Seq(Message)

MaxNat(S) ==
  CHOOSE n \in S : \A m \in S : m <= n

VersionVector(r) ==
  [o \in Replicas |->
    IF {EventSeq[e] : e \in known[r] /\ Origin[e] = o} = {}
    THEN 0
    ELSE MaxNat({EventSeq[e] : e \in known[r] /\ Origin[e] = o})]

Delta(sender, receiver) ==
  {e \in known[sender] : EventSeq[e] > VersionVector(receiver)[Origin[e]]}

Init ==
  /\ known = [r \in Replicas |-> {}]
  /\ network = <<>>

LocalAppend(r, e) ==
  /\ Origin[e] = r
  /\ e \notin known[r]
  /\ known' = [known EXCEPT ![r] = @ \cup {e}]
  /\ UNCHANGED network

Send(sender, receiver) ==
  /\ sender # receiver
  /\ network' = Append(network, [
       from |-> sender,
       to |-> receiver,
       events |-> Delta(sender, receiver)
     ])
  /\ UNCHANGED known

Deliver(i) ==
  /\ i \in 1..Len(network)
  /\ LET msg == network[i] IN
     known' = [known EXCEPT ![msg.to] = @ \cup msg.events]
  /\ network' = SubSeq(network, 1, i - 1) \o SubSeq(network, i + 1, Len(network))

Drop(i) ==
  /\ i \in 1..Len(network)
  /\ network' = SubSeq(network, 1, i - 1) \o SubSeq(network, i + 1, Len(network))
  /\ UNCHANGED known

Duplicate(i) ==
  /\ i \in 1..Len(network)
  /\ network' = Append(network, network[i])
  /\ UNCHANGED known

Next ==
  \/ \E r \in Replicas, e \in Events : LocalAppend(r, e)
  \/ \E sender \in Replicas, receiver \in Replicas : Send(sender, receiver)
  \/ \E i \in 1..Len(network) : Deliver(i)
  \/ \E i \in 1..Len(network) : Drop(i)
  \/ \E i \in 1..Len(network) : Duplicate(i)

Spec == Init /\ [][Next]_<<known, network>>

KnownSubset == \A r \in Replicas : known[r] \subseteq Events

KnownMonotone ==
  \A r \in Replicas : known[r] \subseteq known'[r]

AllEventsAppended ==
  \A e \in Events : e \in known[Origin[e]]

Converged ==
  \A r \in Replicas : known[r] = Events

\* Liveness theorem obligation, to check under fairness in a TLC config:
\* EventualConvergence == AllEventsAppended ~> Converged

=============================================================================
